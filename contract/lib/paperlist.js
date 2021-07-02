/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

'use strict';

// Utility class for collections of ledger states --  a state list
const StateList = require('./../ledger-api/statelist.js');

const EHR = require('./paper.js');

class EHRlist extends StateList {

    constructor(ctx) {
        super(ctx, 'org.papernet.paper');
        this.use(EHR);
    }

    // adiciona o EHR no ledger
    async addEHR(ehr) {
        return this.addState(ehr);
    }

    // Retorna o EHR consultado no ledger
    async getEHR(ehrKey) {
        return this.getState(ehrKey);
    }

    // Atualiza o estado do EHR no ledger
    async updateEHR(ehr) {
        return this.updateState(ehr);
    }
}


module.exports = EHRlist;
