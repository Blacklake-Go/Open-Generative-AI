console.error('REFUSED: deploy-safe.mjs only validated an artifact and did not enforce the production backup/source-snapshot gates. Use scripts/deploy.sh after the complete release gate passes.');
process.exit(2);
