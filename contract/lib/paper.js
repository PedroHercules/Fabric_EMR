/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
*/

'use strict';

// Utility class for ledger state
const State = require('../ledger-api/state.js');


/**
 * EHR class extends State class
 * Class will be used by application and smart contract to define a paper
 */
class EHR extends State {

    constructor(obj) {
        super(EHR.getClass(), [obj.owner, obj.hash]);
        this.permissions = [];
        Object.assign(this, obj);
    }

    /**
     * Basic getters and setters
    */

    setStatus(status){
        this.currentState = status;
    }

    setOrg(org){
        this.org = org;
    }

    getOrg(){
        return this.org;
    }

    setPermissions(newOrg){
        this.permissions.push(newOrg);
    }

    getPermissions(){
        return this.permissions;
    }

    static fromBuffer(buffer) {
        return EHR.deserialize(buffer);
    }

    toBuffer() {
        return Buffer.from(JSON.stringify(this));
    }

    /**
     * Deserialize a state data to commercial paper
     * @param {Buffer} data to form back into the object
     */
    static deserialize(data) {
        return State.deserializeClass(data, EHR);
    }

    /**
     * Factory method to create a commercial paper object
     */
    static createInstance(owner, accessInfo, hash) {
        return new EHR({ owner, accessInfo, hash });
    }

    static getClass() {
        return 'org.papernet.commercialpaper';
    }
}

module.exports = EHR;
