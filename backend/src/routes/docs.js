const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const swaggerUi = require('swagger-ui-express');

const router = express.Router();

// Load OpenAPI specification
let swaggerDocument;
try {
  const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
  const yamlContent = fs.readFileSync(yamlPath, 'utf8');
  swaggerDocument = yaml.load(yamlContent);
} catch (error) {
  console.error('Error loading OpenAPI documentation:', error);
}

// Swagger UI options
const swaggerOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Autoquímicos API Docs',
  customfavIcon: '/favicon.ico'
};

// Serve OpenAPI documentation
router.get('/openapi.yaml', (req, res) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');

    res.setHeader('Content-Type', 'application/x-yaml');
    res.send(yamlContent);
  } catch (error) {
    res.status(404).json({ error: 'Documentation not found' });
  }
});

// Serve OpenAPI documentation as JSON
router.get('/openapi.json', (req, res) => {
  try {
    const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    const jsonContent = yaml.load(yamlContent);

    res.json(jsonContent);
  } catch (error) {
    res.status(404).json({ error: 'Documentation not found' });
  }
});

// Swagger UI documentation
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(swaggerDocument, swaggerOptions));

module.exports = router;
