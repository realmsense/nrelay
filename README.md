# nrelay 

<!-- ![Build](https://github.com/Extacy/nrelay/actions/workflows/main.yml/badge.svg) -->
[![Build Status](https://drone.extacy.cc/api/badges/realmsense/nrelay/status.svg)](https://drone.extacy.cc/realmsense/nrelay)

A headless client for Realm of the Mad God Exalt. Written in TypeScript

## Usage
See [example-project](https://github.com/Extacy/nrelay/tree/example-project) for a template project to use.

## Install
Run the following command to clone and compile the repository and submodules ([realmlib](https://github.com/Extacy/realmlib)):
```
git submodule add https://github.com/Extacy/nrelay
git submodule update --init --recursive
cd nrelay
npm install
tsc --build
```

## Acknowledgements

+ [nrelay](https://github.com/thomas-crane/nrelay) (thomas-crane) - The original nrelay project.
+ [Il2CppInspector](https://github.com/djkaty/Il2CppInspector)
