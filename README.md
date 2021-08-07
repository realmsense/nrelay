# nrelay

A headless client for Realm of the Mad God Exalt. Written in TypeScript

## Contents

+ [Install](#install)
+ [Usage](#usage)
+ [Docs](#docs)
+ [Acknowledgements](#acknowledgements)

## Setup

### Install

```
# Add as a submodule (clones the repo)
git submodule add https://github.com/Extacy/nrelay

# Compile the code
cd nrelay
npm install
npm run compile

# Install nrelay
cd ..
npm install ./nrelay/
```

### Config Files

Run project, shit should be generated on first load?

`src/nrelay/accounts.json`  
```jsonc
[
    // Only `guid` and `password` are required, the rest are optional fields
    {
        "guid": "email",
        "password": "",
        "serverPref": "AsiaSouthEast", // ip or name
        "pathfinder": true, 
        "usesProxy": false,
        "autoConnect": true,
        "clientToken": "" // SHA-1 HWID
    }
]
```

`src/nrelay/proxies.json`
```jsonc
[
    // Proxies are completely optional to use.
    // Note that RotMG limits 4 accounts per IP address on each server.
    {
        "host": "",
        "port": 1234,
        "type": 4, // 4 or 5
        "userId": "", // username, if required (for socks5)
        "password": ""
    }
]
```

## Usage
// TODO, need an example project

## Docs
The inline API documentation can be generated in `./docs/` using the following command:
```
npm run docs
```

## Acknowledgements

+ [nrelay](https://github.com/thomas-crane/nrelay) (thomas-crane) - The original nrelay project.
+ [Il2CppInspector](https://github.com/djkaty/Il2CppInspector)
