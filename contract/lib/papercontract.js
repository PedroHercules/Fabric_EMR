/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

'use strict';

// Fabric smart contract classes
const { Contract, Context } = require('fabric-contract-api');
const shim = require('fabric-shim');

// PaperNet specifc classes
const EHR = require('./paper.js');
const PaperList = require('./paperlist.js');
const QueryUtils = require('./queries.js');

/**
 * A custom context provides easy access to list of all EMRs
 */
class EHRContext extends Context {

    constructor() {
        super();
        // All papers are held in a list of papers
        this.paperList = new PaperList(this);
        this.queryUtils = new QueryUtils(this, 'org.papernet.paper');
    }

}

/**
 * Define commercial paper smart contract by extending Fabric Contract class
 *
 */
class EHRcontract extends Contract {

    constructor() {
        // Unique namespace when multiple contracts per chaincode file
        super('org.papernet.commercialpaper');
    }

    /**
     * Define a custom context for commercial paper
    */
    createContext() {
        return new EHRContext();
    }

    /**
     * Instantiate to perform any setup of the ledger that might be required.
     * @param {Context} ctx the transaction context
     */
    async instantiate(ctx) {
        // No implementation required with this example
        // It could be where data migration is performed, if necessary
        console.log('Instantiate the contract');
    }

    /**
     * Issue EMR
     *
     * @param {Context} ctx the transaction context
     * @param {String} dono do EMR (Paciente)
     * @param {String} Informações de acesso ao EMR 
     * @param {String} Hash do EMR
    */

    async issue(ctx, owner, accessInfo, hash) {

        try{
            // Cria a instancia do EHR
            let ehr = EHR.createInstance(owner, accessInfo, hash); // Cria uma instância da classe EHR

            // Armazena a org emissora do EMR
            ehr.setOrg(ctx.clientIdentity.getMSPID());
            
            ehr.setStatus('Pendent');
            
            // Método para adicionar os dados do EMR no ledger
            await ctx.paperList.addEHR(ehr);

            return ehr;
        }catch(error){
            throw new Error(`FAILED TO REGISTER EHR! ERROR: ${error}`);
        }
    }


    async read(ctx, owner, hash) {

        // Retrieve the current paper using key fields provided
        try{
            let ehrKey = EHR.makeKey([owner, hash]); // Gera uma chave composta 
            let ehr = await ctx.paperList.getEHR(ehrKey); // Consulta o EMR no ledger através da chave composta

            return ehr;
        }catch(error){
            console.log(`ERROR: ${error}`)
        }
    }

    async patientEHRs(ctx, patient) {
        let ehrs = await ctx.queryUtils.queryKeyByOwner(patient); // Consulta todos os EMRs de uma determinado paciente
        return ehrs;
    }

    async orgEHRs(ctx, org) {
        let ehrs = await ctx.queryUtils.queryKeyByOrg(org); // Consulta todos os EMRs de uma determinado organização
        return ehrs;
    }

    async addPermission(ctx, owner, hash, newOrg){ // Em desenvolvimento
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setPermissions(newOrg);

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }

    async assignIssue(ctx, owner, hash){ // Validar o registro de um EMR, altera o STATUS de PENDENTE => CONFIRMADO
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setStatus('Complete');

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }

    async rejectIssue(ctx, owner, hash){ // Validar o registro de um EMR, altera o STATUS de PENDENTE => REJEITADO
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setStatus('Invalid');

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }
}

module.exports = EHRcontract;
