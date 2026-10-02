import { createApp } from './app';
import { env, getPublicConfig } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, () => {
  const publicConfig = getPublicConfig();
  console.log('================================================================');
  console.log('   APIC ProtoHub — Prototyping Network Service Platform         ');
  console.log(`   Port:           http://localhost:${env.PORT}                `);
  console.log(`   Environment:    ${publicConfig.NODE_ENV}                     `);
  console.log(`   Demo Mode:      ${publicConfig.DEMO_MODE ? 'Active (Local Adapters)' : 'Disabled'} `);
  console.log('----------------------------------------------------------------');
  console.log(`   • Health Check:  http://localhost:${env.PORT}/api/health     `);
  console.log(`   • Customer Hub:  http://localhost:${env.PORT}/customer       `);
  console.log(`   • Staff Queue:   http://localhost:${env.PORT}/staff          `);
  console.log(`   • Manager Hub:   http://localhost:${env.PORT}/manager        `);
  console.log(`   • Admin Portal:  http://localhost:${env.PORT}/admin          `);
  console.log('================================================================');
});

function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Shutting down APIC ProtoHub server gracefully...`);
  server.close(() => {
    console.log('Server shut down cleanly.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
