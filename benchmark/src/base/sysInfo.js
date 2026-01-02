import os from 'os';
import process from 'process';

export function getSystemInfo() {
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown CPU';
    const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);

    return {
        runtime: `Node.js ${process.version} (V8 ${process.versions.v8})`,
        platform: `${os.type()} ${os.release()} (${os.arch()})`,
        cpu: `${cpuModel} (${cpus.length} Cores)`,
        memory: `${totalMemGB} GB`
    };
}

export function printSystemInfo() {
    const sys = getSystemInfo();
    console.log(`\n================================================================================`);
    console.log(`⚡ BENCHMARK ENVIRONMENT`);
    console.log(`================================================================================`);
    console.log(`Runtime:   ${sys.runtime}`);
    console.log(`OS:        ${sys.platform}`);
    console.log(`CPU:       ${sys.cpu}`);
    console.log(`Memory:    ${sys.memory}`);
    console.log(`================================================================================`);
}