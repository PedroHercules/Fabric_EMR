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
 * A custom context provides easy access to list of all commercial papers
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
     * Issue commercial paper
     *
     * @param {Context} ctx the transaction context
     * @param {String} issuer commercial paper issuer
     * @param {Integer} paperNumber paper number for this issuer
     * @param {String} issueDateTime paper issue date
     * @param {String} maturityDateTime paper maturity date
     * @param {Integer} faceValue face value of paper
    */

    async ehrExists(ctx, owner, hash){
        let ehrKey = EHR.makeKey([owner, hash]);
        let buffer = await ctx.paperList.getEHR(ehrKey);
        return (!!buffer && buffer > 0);
    }

    async issue(ctx, owner, accessInfo, hash) {

        let exists = await this.ehrExists(ctx, owner, hash);
        if (exists){
            return shim.error();
        }

        try{
            // Cria a instancia do EHR
            let ehr = EHR.createInstance(owner, accessInfo, hash);

            // Armazena a org emissora do EHR
            ehr.setOrg(ctx.clientIdentity.getMSPID());
            
            ehr.setStatus('Pendent');
            
            // Adiciona o EHR no ledger usando a classe PaperList
            await ctx.paperList.addEHR(ehr);

            return ehr;
        }catch(error){
            throw new Error(`FAILED TO REGISTER EHR! ERROR: ${error}`);
        }
    }


    async read(ctx, owner, hash) {

        // Retrieve the current paper using key fields provided
        try{
            let ehrKey = EHR.makeKey([owner, hash]);
            let ehr = await ctx.paperList.getEHR(ehrKey);

            return ehr;
        }catch(error){
            console.log(`ERROR: ${error}`)
        }
    }

    async patientEHRs(ctx, patient) {
        let ehrs = await ctx.queryUtils.queryKeyByOwner(patient);
        return ehrs;
    }

    async orgEHRs(ctx, org) {
        let ehrs = await ctx.queryUtils.queryKeyByOrg(org);
        return ehrs;
    }

    async addPermission(ctx, owner, hash, newOrg){
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setPermissions(newOrg);

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }

    async assignIssue(ctx, owner, hash){
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setStatus('Complete');

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }

    async rejectIssue(ctx, owner, hash){
        let ehrKey = EHR.makeKey([owner, hash]);
        let ehr = await ctx.paperList.getEHR(ehrKey);

        ehr.setStatus('Invalid');

        await ctx.paperList.updateEHR(ehr);

        return ehr;
    }

    // NÃO MODIFIQUEI OS MÉTODOS ABAIXO, SOMENTE O ISSUE E READ FUNCIONAM

    /**
      *  Buy request:  (2-phase confirmation: Commercial paper is 'PENDING' subject to completion of transfer by owning org)
      *  Alternative to 'buy' transaction
      *  Note: 'buy_request' puts paper in 'PENDING' state - subject to transfer confirmation [below].
      * 
      * @param {Context} ctx the transaction context
      * @param {String} issuer commercial paper issuer
      * @param {Integer} paperNumber paper number for this issuer
      * @param {String} currentOwner current owner of paper
      * @param {String} newOwner new owner of paper                              // transaction input - not written to asset per se - but written to block
      * @param {Integer} price price paid for this paper                         // transaction input - not written to asset per se - but written to block
      * @param {String} purchaseDateTime time paper was requested                // transaction input - ditto.
     */
    async buy_request(ctx, issuer, paperNumber, currentOwner, newOwner, price, purchaseDateTime) {
        

        // Retrieve the current paper using key fields provided
        let paperKey = CommercialPaper.makeKey([issuer, paperNumber]);
        let paper = await ctx.paperList.getPaper(paperKey);

        // Validate current owner - this is really information for the user trying the sample, rather than any 'authorisation' check per se FYI
        if (paper.getOwner() !== currentOwner) {
            throw new Error('\nPaper ' + issuer + paperNumber + ' is not owned by ' + currentOwner + ' provided as a paraneter');
        }
        // paper set to 'PENDING' - can only be transferred (confirmed) by identity from owning org (MSP check).
        paper.setPending();

        // Update the paper
        await ctx.paperList.updatePaper(paper);
        return paper;
    }

    /**
     * transfer commercial paper: only the owning org has authority to execute. It is the complement to the 'buy_request' transaction. '[]' is optional below.
     * eg. issue -> buy_request -> transfer -> [buy ...n | [buy_request...n | transfer ...n] ] -> redeem
     * this transaction 'pair' is an alternative to the straight issue -> buy -> [buy....n] -> redeem ...path
     *
     * @param {Context} ctx the transaction context
     * @param {String} issuer commercial paper issuer
     * @param {Integer} paperNumber paper number for this issuer
     * @param {String} newOwner new owner of paper
     * @param {String} newOwnerMSP  MSP id of the transferee
     * @param {String} confirmDateTime  confirmed transfer date.
    */
    async transfer(ctx, issuer, paperNumber, newOwner, newOwnerMSP, confirmDateTime) {

        // Retrieve the current paper using key fields provided
        let paperKey = CommercialPaper.makeKey([issuer, paperNumber]);
        let paper = await ctx.paperList.getPaper(paperKey);

        // Validate current owner's MSP in the paper === invoking transferor's MSP id - can only transfer if you are the owning org.

        if (paper.getOwnerMSP() !== ctx.clientIdentity.getMSPID()) {
            throw new Error('\nPaper ' + issuer + paperNumber + ' is not owned by the current invoking Organisation, and not authorised to transfer');
        }

        // Paper needs to be 'pending' - which means you need to have run 'buy_pending' transaction first.
        if ( ! paper.isPending()) {
            throw new Error('\nPaper ' + issuer + paperNumber + ' is not currently in state: PENDING for transfer to occur: \n must run buy_request transaction first');
        }
        // else all good

        paper.setOwner(newOwner);
        // set the MSP of the transferee (so that, that org may also pass MSP check, if subsequently transferred/sold on)
        paper.setOwnerMSP(newOwnerMSP);
        paper.setTrading();
        paper.confirmDateTime = confirmDateTime;

        // Update the paper
        await ctx.paperList.updatePaper(paper);
        return paper;
    }

    /**
     * Redeem commercial paper
     *
     * @param {Context} ctx the transaction context
     * @param {String} issuer commercial paper issuer
     * @param {Integer} paperNumber paper number for this issuer
     * @param {String} redeemingOwner redeeming owner of paper
     * @param {String} issuingOwnerMSP the MSP of the org that the paper will be redeemed with.
     * @param {String} redeemDateTime time paper was redeemed
    */
    async redeem(ctx, issuer, paperNumber, redeemingOwner, issuingOwnerMSP, redeemDateTime) {

        let paperKey = CommercialPaper.makeKey([issuer, paperNumber]);

        let paper = await ctx.paperList.getPaper(paperKey);

        // Check paper is not alread in a state of REDEEMED
        if (paper.isRedeemed()) {
            throw new Error('\nPaper ' + issuer + paperNumber + ' has already been redeemed');
        }

        // Validate current redeemer's MSP matches the invoking redeemer's MSP id - can only redeem if you are the owning org.

        if (paper.getOwnerMSP() !== ctx.clientIdentity.getMSPID()) {
            throw new Error('\nPaper ' + issuer + paperNumber + ' cannot be redeemed by ' + ctx.clientIdentity.getMSPID() + ', as it is not the authorised owning Organisation');
        }

        // As this is just a sample, can show additional verification check: that the redeemer provided matches that on record, before redeeming it
        if (paper.getOwner() === redeemingOwner) {
            paper.setOwner(paper.getIssuer());
            paper.setOwnerMSP(issuingOwnerMSP);
            paper.setRedeemed();
            paper.redeemDateTime = redeemDateTime; // record redemption date against the asset (the complement to 'issue date')
        } else {
            throw new Error('\nRedeeming owner: ' + redeemingOwner + ' organisation does not currently own paper: ' + issuer + paperNumber);
        }

        await ctx.paperList.updatePaper(paper);
        return paper;
    }

    // Query transactions

    /**
     * Query history of a commercial paper
     * @param {Context} ctx the transaction context
     * @param {String} issuer commercial paper issuer
     * @param {Integer} paperNumber paper number for this issuer
    */
    async queryHistory(ctx, issuer, paperNumber) {

        // Get a key to be used for History query

        let query = new QueryUtils(ctx, 'org.papernet.paper');
        let results = await query.getAssetHistory(issuer, paperNumber); // (cpKey);
        return results;

    }

    /**
    * queryOwner commercial paper: supply name of owning org, to find list of papers based on owner field
    * @param {Context} ctx the transaction context
    * @param {String} owner commercial paper owner
    */
    async queryOwner(ctx, owner) {

        let query = new QueryUtils(ctx, 'org.papernet.paper');
        let owner_results = await query.queryKeyByOwner(owner);

        return owner_results;
    }

    /**
    * queryPartial commercial paper - provide a prefix eg. "DigiBank" will list all papers _issued_ by DigiBank etc etc
    * @param {Context} ctx the transaction context
    * @param {String} prefix asset class prefix (added to paperlist namespace) eg. org.papernet.paperMagnetoCorp asset listing: papers issued by MagnetoCorp.
    */
    async queryPartial(ctx, prefix) {

        let query = new QueryUtils(ctx, 'org.papernet.paper');
        let partial_results = await query.queryKeyByPartial(prefix);

        return partial_results;
    }

    /**
    * queryAdHoc commercial paper - supply a custom mango query
    * eg - as supplied as a param:     
    * ex1:  ["{\"selector\":{\"faceValue\":{\"$lt\":8000000}}}"]
    * ex2:  ["{\"selector\":{\"faceValue\":{\"$gt\":4999999}}}"]
    * 
    * @param {Context} ctx the transaction context
    * @param {String} queryString querystring
    */
    async queryAdhoc(ctx, queryString) {

        let query = new QueryUtils(ctx, 'org.papernet.paper');
        let querySelector = JSON.parse(queryString);
        let adhoc_results = await query.queryByAdhoc(querySelector);

        return adhoc_results;
    }


    /**
     * queryNamed - supply named query - 'case' statement chooses selector to build (pre-canned for demo purposes)
     * @param {Context} ctx the transaction context
     * @param {String} queryname the 'named' query (built here) - or - the adHoc query string, provided as a parameter
     */
    async queryNamed(ctx, queryname) {
        let querySelector = {};
        switch (queryname) {
            case "redeemed":
                querySelector = { "selector": { "currentState": 4 } };  // 4 = redeemd state
                break;
            case "trading":
                querySelector = { "selector": { "currentState": 3 } };  // 3 = trading state
                break;
            case "value":
                // may change to provide as a param - fixed value for now in this sample
                querySelector = { "selector": { "faceValue": { "$gt": 4000000 } } };  // to test, issue CommPapers with faceValue <= or => this figure.
                break;
            default: // else, unknown named query
                throw new Error('invalid named query supplied: ' + queryname + '- please try again ');
        }

        let query = new QueryUtils(ctx, 'org.papernet.paper');
        let adhoc_results = await query.queryByAdhoc(querySelector);

        return adhoc_results;
    }

}

module.exports = EHRcontract;
