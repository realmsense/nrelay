import { PacketMap } from 'realmlib';
import { EventEmitter } from 'events';
import { createWriteStream, WriteStream } from 'fs';
import { isIP } from 'net';
import { Client, LibraryManager, ResourceManager, RunOptions } from '../core';
import { Account, Server, Proxy, RuntimeError, NoProxiesAvailableError, AccountAlreadyManagedError } from '../models';
import { AccountService, censorGuid, DefaultLogger, FileLogger, Logger, LogLevel } from '../services';
import { delay } from '../util/misc-util';
import { Environment } from './environment';
import { Versions } from './versions';
import { ProxyPool } from '../core/proxy-pool';

const MAX_RETRIES = 10;

/**
 * An object which can be provided to the runtime when running.
 */
interface Arguments {
  [argName: string]: unknown;
}

/**
 * An account which was initially added, but failed for some reason.
 */
interface FailedAccount {
  /**
   * The account which failed to load.
   */
  account: Account;
  /**
   * Whether the account should try to load again.
   */
  retry: boolean;
  /**
   * The number of times this account has tried to be loaded.
   */
  retryCount: number;
  /**
   * The number of seconds to wait before trying to load this account again.
   */
  timeout: number;
}

/**
 * The runtime manages clients, resources, plugins and any other services
 * which are used by an nrelay project.
 */
export class Runtime extends EventEmitter {

  readonly env: Environment;
  readonly accountService: AccountService;
  readonly resources: ResourceManager;
  readonly libraryManager: LibraryManager;
  readonly proxyPool: ProxyPool;
  
  buildVersion: string;
  clientToken: string;
  args: Arguments;

  private logStream: WriteStream;
  private readonly clients: Map<string, Client>;

  constructor(environment: Environment) {
    super();
    this.env = environment;
    this.accountService = new AccountService(this.env);
    this.resources = new ResourceManager(this.env);
    this.libraryManager = new LibraryManager(this);
    this.proxyPool = new ProxyPool(environment);
    this.clients = new Map();
  }

  /**
   * Starts this runtime.
   * @param args The arguments to start the runtime with.
   */
  async run(options: RunOptions): Promise<void> {

    // set up the logging.
    let minLevel = LogLevel.Info;
    if (options.debug) {
      minLevel = LogLevel.Debug;
    }
    Logger.addLogger(new DefaultLogger(minLevel));

    // set up the log file if we have the flag enabled.
    if (options.logFile) {
      Logger.log('Runtime', 'Creating a log file.', LogLevel.Info);
      this.createLog();
      Logger.addLogger(new FileLogger(this.logStream));
    }

    // load the version info.
    const versions = this.env.readJSON<Versions>('src', 'nrelay', 'versions.json');
    if (versions !== undefined) {
      if (versions.buildVersion) {
        this.buildVersion = versions.buildVersion;
        Logger.log('Runtime', `Using build version "${this.buildVersion}"`, LogLevel.Info);
      } else {
        this.buildVersion = '1.2.0.3.0'
        Logger.log('Runtime', 'Cannot load buildVersion. Clients may not be able to connect.', LogLevel.Warning);
      }
      if (versions.clientToken) {
        this.clientToken = versions.clientToken;
        Logger.log('Runtime', `Using client token "${this.clientToken}"`, LogLevel.Info);
      } else {
        Logger.log('Runtime', 'Cannot load clientToken - inserting the default value', LogLevel.Warning);
        // exalt client token
        this.clientToken = '8bV53M5ysJdVjU4M97fh2g7BnPXhefnc';
        this.env.updateJSON<Versions>({ clientToken: this.clientToken }, 'src', 'nrelay', 'versions.json');
      }
    } else {
      Logger.log('Runtime', 'Cannot load versions.json', LogLevel.Error);
      process.exit(1);
    }

    if (options.update || options.forceUpdate) {
      const buildHash = versions.buildHash;
      await this.resources.updateResources(buildHash, options.forceUpdate);
    }

    // load the resources.
    try {
      await this.resources.loadAllResources();
    } catch (error) {
      Logger.log('Runtime', 'Error while loading resources.', LogLevel.Error);
      Logger.log('Runtime', error.message, LogLevel.Error);
      process.exit(1);
    }

    // load the packets
    const packets: PacketMap = this.env.readJSON('src', 'nrelay', 'packets.json');
    if (!packets) {
      Logger.log('Runtime', 'Cannot load packets.json', LogLevel.Error);
      process.exit(1);
    } else {
      // the length is divided by 2 because the map is bidirectional.
      const size = Object.keys(PacketMap).length / 2;
      Logger.log('Runtime', `Mapped ${size} packet ids`, LogLevel.Info);
    }

    // load the client hooks.
    this.libraryManager.loadClientHooks();

    // if plugin loading is enabled.
    if (options.plugins !== false) {
      // load the plugins. The default is to load plugins from `lib/`, but we can change that with an arg.
      let pluginFolder = 'lib';
      if (options.pluginPath && typeof options.pluginPath === 'string') {
        pluginFolder = options.pluginPath;
        Logger.log('Runtime', `Loading plugins from "${pluginFolder}"`, LogLevel.Debug);
      }
      this.libraryManager.loadPlugins(pluginFolder);
    } else {
      Logger.log('Runtime', 'Plugin loading disabled', LogLevel.Info);
    }

    // load the proxy pool
    this.proxyPool.loadProxies();

    // finally, load any accounts.
    const accounts = this.env.readJSON<Account[]>('src', 'nrelay', 'accounts.json');
    if (accounts) {
      const failures: FailedAccount[] = [];
      for (const account of accounts) {
        try {
          await this.addClient(account);
        } catch (err) {
          const error = err as RuntimeError;
          
          const failure: FailedAccount = {
            account,
            retryCount: 1,
            timeout: 1,
            retry: true
          };

          // use a custom timeout if the error has one (e.g. AccountInUseError)
          const timeout = error.timeout;
          if (timeout) {
            failure.timeout = timeout;
          }
        
          // if the error specifically specified the failure should not retry. (e.g. NoProxiesAvailableError)
          const retry = error.retry !== false;
          if (retry) {
            failures.push(failure);
          }

          Logger.log('Runtime', `Error adding account "${account.alias}": ${error.message}. ${retry ? "":"Not retrying."}`, LogLevel.Error);
        }
      }
      
      // try to load the failed accounts.
      for (const failure of failures) {
        // perform the work in a promise so it doesn't block.
        new Promise<void>(async (resolve, reject) => {
          while (failure.retryCount <= MAX_RETRIES && failure.retry) {
            Logger.log(
              'Runtime',
              `Retrying "${failure.account.alias}" in ${failure.timeout} seconds. (${failure.retryCount}/10)`,
              LogLevel.Info,
            );

            // wait for the timeout then try to add the client.
            await delay(failure.timeout * 1000);
            
            try {
              await this.addClient(failure.account);
              resolve();
            } catch (err) {
              const error = err as RuntimeError;
              const timeout = error.timeout;

              // increase the timeout on a logarithmic scale
              if (timeout == undefined) {
                Math.floor(Math.log10(1 + failure.retryCount) / 2 * 100);
              }

              // if the error specifically specified the failure should not retry. (e.g. NoProxiesAvailableError)
              const retry = error.retry !== false;
              if (!retry) {
                failure.retry = false;
              }

              failure.retryCount++;
              Logger.log('Runtime', `Error adding account "${failure.account.alias}": ${error.message} ${retry ? "":"Not retrying."}`, LogLevel.Error);
            }
          }
          reject();
        }).catch(() => {
          Logger.log(
            'Runtime',
            `Failed to load "${failure.account.alias}" after ${MAX_RETRIES} retries. Not retrying.`,
            LogLevel.Error,
          );
        });
      }
    }
  }

  /**
   * Creates a new client which uses the provided account.
   * @param account The account to login to.
   */
  async addClient(account: Account): Promise<Client> {

    // make sure it's not already part of this runtime.
    if (this.clients.has(account.guid)) {
      return Promise.reject(new AccountAlreadyManagedError());
    }

    // Set default values if option wasn't specified in accounts.json
    account.alias       = account.alias       || censorGuid(account.guid);
    account.serverPref  = account.serverPref  || "";
    account.autoConnect = account.autoConnect !== false;
    account.usesProxy   = account.usesProxy   || false;
    account.pathfinder  = account.pathfinder  || false;

    Logger.log('Runtime', `Loading ${account.alias}...`);

    let proxy: Proxy;
    if (account.usesProxy && (proxy = this.proxyPool.getNextAvailableProxy()) == null) {
      return Promise.reject(new NoProxiesAvailableError());
    }

    const charInfo = await this.accountService.getCharacterInfo(account.guid, account.password, proxy);
    account.charInfo = charInfo;

    const serverList = await this.accountService.getServerList();
    const serverKeys = Object.keys(serverList);
    if (serverKeys.length === 0) {
      throw new Error("Server list is empty");
    }

    let server = serverList[account.serverPref];
    if (!server) {
      if (isIP(account.serverPref)) {
        server = {
          address: account.serverPref,
          name: `IP: ${account.serverPref}`,
        };
      } else {
        // if an invalid server was specified, choose a random one instead
        const random = Math.floor(Math.random() * serverKeys.length);
        server = serverList[serverKeys[random]];
        Logger.log(account.alias, `Preferred server not found. Using ${server.name} instead.`, LogLevel.Warning);
      }
    }

    Logger.log('Runtime', `Loaded ${account.alias}!`, LogLevel.Success);
    const client = new Client(this, server, account, proxy);
    this.clients.set(client.guid, client);
    return client;
  }

  /**
   * Removes the client with the given `guid` from this runtime.
   * @param guid The guid of the client to remove.
   */
  removeClient(guid: string): void {
    // make sure the client is actually in this runtime.
    if (this.clients.has(guid)) {
      const alias = this.clients.get(guid).alias;
      this.clients.get(guid).destroy();
      this.clients.delete(guid);
      Logger.log('Runtime', `Removed ${alias}!`, LogLevel.Success);
    } else {
      Logger.log(
        'Runtime',
        `The client ${censorGuid(guid)} is not part of this runtime.`,
        LogLevel.Warning,
      );
    }
  }

  /**
   * Gets a copy of the clients in this runtime.
   * Modifying this list will not affect the runtime.
   */
  getClients(): Client[] {
    return [...this.clients.values()];
  }

  /**
   * Creates a log file for this runtime.
   */
  private createLog(): void {
    const nrelayVersion = require('../../package.json').version;
    this.logStream = createWriteStream(this.env.pathTo('src', 'nrelay', 'nrelay-log.log'));
    const watermark = [
      'INFO',
      '----',
      `date           :: ${(new Date()).toString()}`,
      `nrelay version :: v${nrelayVersion}`,
      `node version   :: ${process.version}`,
      '',
      'LOG',
      '----',
    ].join('\n');
    this.logStream.write(`${watermark}\n`);
  }
}
