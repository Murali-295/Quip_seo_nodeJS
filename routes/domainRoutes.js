const express = require('express');
const router = express.Router();
const { createDomain, getDomain, getAllDomains, deleteDomain, updateDomain, downloadMapperFile, renderImage} = require('../controllers/domainController');

// Create a new domain
router.post('/createDomain',createDomain);

// get domain
router.get('/getDomain/:id', getDomain);

//get All domains
router.get('/getAllDomains',getAllDomains);

// delete domain
router.delete('/deleteDomain/:id', deleteDomain);

// update domain
router.put('/updateDomain',updateDomain);

// downloadMapperFile
router.get('/downloadMapper/:id', downloadMapperFile);

// render image
router.get('/renderImage/:id', renderImage);
module.exports=router;