#!/usr/bin/env bash
source ~/.evoenv

export VUE_APP_ENV_RUN="local"

rm env/registeredContracts_local.json

node ./scripts/registerContracts.js