'use strict';

const express = require('express');
const publicRoutes = require('./public.routes');
const authRoutes = require('./auth.routes');
const touristRoutes = require('./tourist.routes');
const companyRoutes = require('./company.routes');
const adminRoutes = require('./admin.routes');

const router = express.Router();

router.use('/', publicRoutes);
router.use('/auth', authRoutes);
router.use('/tourist', touristRoutes);
router.use('/company', companyRoutes);
router.use('/admin', adminRoutes);

module.exports = router;