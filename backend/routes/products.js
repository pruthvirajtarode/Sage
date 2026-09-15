const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Mock data path
const mockProductsPath = path.join(__dirname, '../data/mockProducts.json');

// GET /api/products - Fetch all products
router.get('/', (req, res) => {
    try {
        const rawData = fs.readFileSync(mockProductsPath);
        const products = JSON.parse(rawData);
        res.json(products);
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products.' });
    }
});

// GET /api/products/:id - Fetch a single product
router.get('/:id', (req, res) => {
    try {
        const rawData = fs.readFileSync(mockProductsPath);
        const products = JSON.parse(rawData);
        const product = products.find(p => p.id === req.params.id);
        
        if (!product) {
            return res.status(404).json({ error: 'Product not found.' });
        }
        
        res.json(product);
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({ error: 'Failed to fetch product details.' });
    }
});

module.exports = router;
