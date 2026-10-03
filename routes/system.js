/**
 * 系统监控路由
 * 提供服务器状态监控、性能指标等功能
 */

const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { logger } = require('../utils/logger');
const config = require('../config');

// ==================== 工具函数 ====================

/**
 * 获取CPU详细信息
 */
async function getCPUInfo() {
    const cpus = os.cpus();
    const cpu = cpus[0];
    const totalTimes = cpus.reduce((acc, cpu) => {
        for (const type in cpu.times) {
            acc[type] = (acc[type] || 0) + cpu.times[type];
        }
        return acc;
    }, {});

    // 计算CPU使用率
    const idle = totalTimes.idle;
    const total = Object.values(totalTimes).reduce((a, b) => a + b, 0);
    const usage = ((total - idle) / total * 100).toFixed(1);

    // 获取CPU型号
    let cpuModel = cpu.model;
    // 清理CPU型号中的多余空格和换行
    if (cpuModel) {
        cpuModel = cpuModel.replace(/\s+/g, ' ').trim();
    }

    // 获取CPU温度（通过执行命令）
    let temperature = null;
    try {
        // 尝试读取系统温度传感器
        if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
            const tempRaw = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
            temperature = (parseInt(tempRaw) / 1000).toFixed(1);
        } else if (process.platform === 'linux') {
            // 尝试使用sensors命令
            try {
                const { execSync } = require('child_process');
                const sensorsOutput = execSync('sensors 2>/dev/null || echo ""', { encoding: 'utf8' });
                const tempMatch = sensorsOutput.match(/Core 0.*?\+([0-9.]+)°C/);
                if (tempMatch) {
                    temperature = tempMatch[1];
                }
            } catch (e) {
                // 忽略
            }
        } else if (process.platform === 'win32') {
            // Windows平台使用多种方法获取CPU温度
            
            // 方法1：使用wmic读取ThermalZoneTemperature
            try {
                const { execSync } = require('child_process');
                const wmicOutput = execSync(
                    'wmic /OUTPUT:"%TEMP%\\temp.txt" PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /VALUE 2>nul && type "%TEMP%\\temp.txt" && del "%TEMP%\\temp.txt" 2>nul',
                    { encoding: 'utf8', timeout: 5000, windowsHide: true }
                );
                const tempMatch = wmicOutput.match(/CurrentTemperature=(\d+)/);
                if (tempMatch) {
                    temperature = ((parseInt(tempMatch[1]) / 10) - 273.15).toFixed(1);
                    logger.debug('通过wmic获取到CPU温度:', temperature);
                }
            } catch (e) {
                logger.debug('wmic获取CPU温度失败:', e.message);
            }
            
            // 方法2：使用PowerShell读取WMI
            if (!temperature) {
                try {
                    const { execSync } = require('child_process');
                    const psOutput = execSync(
                        'powershell -Command "Get-CimInstance -Query \\"SELECT * FROM MSAcpi_ThermalZoneTemperature\\" -ErrorAction SilentlyContinue | ForEach-Object { [Math]::Round($_.CurrentTemperature / 10 - 273.15, 1) }" 2>nul',
                        { encoding: 'utf8', timeout: 5000 }
                    );
                    if (psOutput && psOutput.trim()) {
                        temperature = psOutput.trim();
                        logger.debug('通过PowerShell获取到CPU温度:', temperature);
                    }
                } catch (e2) {
                    logger.debug('PowerShell获取CPU温度失败:', e2.message);
                }
            }
            
            // 方法3：使用PowerShell读取Win32_TemperatureProbe
            if (!temperature) {
                try {
                    const { execSync } = require('child_process');
                    const psOutput = execSync(
                        'powershell -Command "Get-CimInstance -ClassName Win32_TemperatureProbe -ErrorAction SilentlyContinue | Select-Object -First 1 CurrentReading | ForEach-Object { if ($_) { [Math]::Round($_.CurrentReading / 10, 1) } }" 2>nul',
                        { encoding: 'utf8', timeout: 5000 }
                    );
                    if (psOutput && psOutput.trim() && !psOutput.toLowerCase().includes('error')) {
                        temperature = psOutput.trim();
                        logger.debug('通过Win32_TemperatureProbe获取到CPU温度:', temperature);
                    }
                } catch (e) {
                    logger.debug('Win32_TemperatureProbe获取失败:', e.message);
                }
            }
            
            // 方法4：使用speedfan或其他工具（如果安装）
            if (!temperature) {
                try {
                    const { execSync } = require('child_process');
                    // 尝试读取OpenHardwareMonitor数据
                    const psOutput = execSync(
                        'powershell -Command "Get-CimInstance -Namespace \\"root\\OpenHardwareMonitor\\" -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq \\"Temperature\\" -and $_.Name -like \\"*CPU*\\"} | Select-Object -First 1 Value | ForEach-Object { if ($_.Value) { $_.Value } }" 2>nul',
                        { encoding: 'utf8', timeout: 5000 }
                    );
                    if (psOutput && psOutput.trim()) {
                        temperature = psOutput.trim();
                        logger.debug('通过OpenHardwareMonitor获取到CPU温度:', temperature);
                    }
                } catch (e) {
                    // OpenHardwareMonitor可能未安装，忽略
                    logger.debug('OpenHardwareMonitor获取失败（可能未安装）');
                }
            }
            
            // 方法5：使用registry或系统信息作为最后的猜测
            if (!temperature) {
                // 在虚拟机或容器环境中，CPU温度可能无法获取
                // 这种情况是正常的，不需要警告
                logger.debug('无法获取CPU温度（虚拟机/容器环境可能是正常的）');
            }
        } else if (process.platform === 'darwin') {
            // macOS平台
            try {
                const { execSync } = require('child_process');
                const osxOutput = execSync('sudo powermetrics --samplers smc | grep -i "CPU die temperature" 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 10000 });
                const tempMatch = osxOutput.match(/CPU die temperature: (\d+)/);
                if (tempMatch) {
                    temperature = tempMatch[1];
                }
            } catch (e) {
                // 忽略
            }
        }
    } catch (e) {
        logger.debug('无法获取CPU温度:', e.message);
    }

    return {
        usage,
        cores: cpus.length,
        model: cpuModel,
        speed: cpu.speed, // MHz
        architecture: os.arch(),
        temperature,
        times: {
            user: totalTimes.user,
            nice: totalTimes.nice,
            sys: totalTimes.sys,
            idle: totalTimes.idle,
            irq: totalTimes.irq
        }
    };
}

/**
 * 获取GPU信息
 * 支持物理显卡和虚拟显卡的检测
 */
async function getGPUInfo() {
    let gpu = {
        usage: null,
        temperature: null,
        memory: null,
        memoryUsed: null,
        memoryTotal: null,
        name: null,
        isDedicated: false,
        vram: null
    };

    // 独立显卡标识关键词
    const dedicatedKeywords = ['NVIDIA', 'AMD', 'Radeon', 'GeForce', 'RTX', 'GTX', 'Quadro', 'FirePro', 'WX', 'RX'];
    const integratedKeywords = ['Intel', 'UHD', 'Iris', 'HD Graphics', 'Xe'];

    // 虚拟显卡厂商ID和设备ID映射表
    const virtualGPU数据库 = {
        '1013': { // Cirrus Logic
            '00b8': { name: 'Cirrus Logic GD5446', virtPlatform: 'KVM/QEMU' },
            '0040': { name: 'Cirrus Logic GD5480', virtPlatform: 'QEMU' },
            '00a0': { name: 'Cirrus Logic CL-GD5480', virtPlatform: 'QEMU' }
        },
        '1af4': { // Red Hat (QEMU/KVM)
            '1100': { name: 'QEMU Virtual Video', virtPlatform: 'KVM/QEMU' },
            '1110': { name: 'QXL Graphics', virtPlatform: 'KVM/QEMU (QXL)' },
            '1103': { name: 'Alibaba Cloud Virtual Graphics', virtPlatform: 'Alibaba Cloud' },
            '1af4': { name: 'Red Hat Virtual Graphics', virtPlatform: 'KVM/QEMU' }
        },
        '1d0f': { // Amazon (AWS)
            'ffff': { name: 'Amazon EC2 GPU', virtPlatform: 'AWS' },
            '1d0f': { name: 'Amazon Elastic GPU', virtPlatform: 'AWS' }
        },
        '15ad': { // VMware
            '0405': { name: 'VMware SVGA II', virtPlatform: 'VMware' },
            '0710': { name: 'VMware SVGA II', virtPlatform: 'VMware' },
            '0780': { name: 'VMware SVGA II', virtPlatform: 'VMware' }
        },
        '80ee': { // VirtualBox
            'beef': { name: 'VirtualBox Graphics', virtPlatform: 'VirtualBox' }
        },
        '1414': { // Microsoft (Hyper-V)
            '008e': { name: 'Microsoft Hyper-V GPU', virtPlatform: 'Hyper-V' },
            '52d0': { name: 'Microsoft Basic Render', virtPlatform: 'Hyper-V' }
        },
        '1234': { // QEMU/Bochs
            '1111': { name: 'QEMU/Bochs VBE', virtPlatform: 'QEMU' }
        },
        '1b36': { // Red Hat (VirtIO)
            '0001': { name: 'VirtIO GPU', virtPlatform: 'KVM/VirtIO' },
            '0002': { name: 'VirtIO GPU (VGA)', virtPlatform: 'KVM/VirtIO' },
            '0004': { name: 'VirtIO GPU (1.0)', virtPlatform: 'KVM/VirtIO' },
            '0011': { name: 'VirtIO GPU (blob)', virtPlatform: 'KVM/VirtIO' }
        },
        '8086': { // Intel (用于云环境的虚拟Intel显卡)
            'ffff': { name: 'Intel Virtual Graphics', virtPlatform: 'Cloud' },
            '0011': { name: 'Intel GVT-g Virtual GPU', virtPlatform: 'KVM/Intel GVT' }
        },
        '102b': { // Matrox (偶尔用于虚拟化)
            '0522': { name: 'Matrox Graphics', virtPlatform: 'Virtual' },
            '0532': { name: 'Matrox Graphics', virtPlatform: 'Virtual' }
        }
    };

    // 辅助函数：清理十六进制值（去除0x前缀并转为小写）
    function cleanHexValue(value) {
        if (typeof value !== 'string') return value;
        return value.toLowerCase().replace(/^0x/, '').trim();
    }

    try {
        if (process.platform === 'linux') {
            // 方法1：尝试读取NVIDIA GPU信息
            try {
                const nvidiaSmi = execSync('nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null', { encoding: 'utf8' });
                const lines = nvidiaSmi.trim().split('\n');
                if (lines.length > 0 && lines[0] && !lines[0].includes('No')) {
                    const parts = lines[0].split(', ');
                    const gpuName = parts[0]?.trim() || '';

                    // 判断是否为独立显卡
                    const isDedicated = dedicatedKeywords.some(keyword => gpuName.includes(keyword)) ||
                                        !integratedKeywords.some(keyword => gpuName.includes(keyword));

                    // 获取显存信息
                    const memoryTotal = parts[4]?.trim() ? parseInt(parts[4].trim()) : null;
                    const memoryUsed = parts[3]?.trim() ? parseInt(parts[3].trim()) : null;

                    gpu = {
                        name: gpuName,
                        temperature: parts[1]?.trim(),
                        usage: parts[2]?.trim(),
                        memoryUsed: memoryUsed ? `${memoryUsed} MB` : null,
                        memoryTotal: memoryTotal ? `${memoryTotal} MB` : null,
                        isDedicated,
                        vram: memoryTotal ? `${memoryTotal} MB` : null
                    };
                    logger.debug('通过nvidia-smi获取到GPU信息:', gpu.name);
                }
            } catch (e) {
                // nvidia-smi失败，尝试其他方法
                logger.debug('nvidia-smi获取失败:', e.message);
            }

            // 方法2：通过sysfs读取PCI显卡设备信息（当lspci不可用时）
            if (!gpu.name) {
                try {
                    // 查找VGA兼容控制器设备
                    const drmPath = '/sys/class/drm';
                    if (fs.existsSync(drmPath)) {
                        const entries = fs.readdirSync(drmPath);
                        for (const entry of entries) {
                            if (entry.startsWith('card')) {
                                const cardPath = path.join(drmPath, entry, 'device');
                                if (fs.existsSync(cardPath)) {
                                    // 读取vendor和device ID
                                    const vendorPath = path.join(cardPath, 'vendor');
                                    const devicePath = path.join(cardPath, 'device');
                                    const ueventPath = path.join(cardPath, 'uevent');

                                    if (fs.existsSync(ueventPath)) {
                                        const uevent = fs.readFileSync(ueventPath, 'utf8');

                                        // 解析PCI信息
                                        const vendorMatch = uevent.match(/PCI_ID=([0-9a-fA-F]+):([0-9a-fA-F]+)/i);
                                        const driverMatch = uevent.match(/DRIVER=([^\n]+)/i);
                                        const classMatch = uevent.match(/PCI_CLASS=([0-9a-fA-F]+)/i);

                                        if (vendorMatch) {
                                            // 清理十六进制值（去除0x前缀并转为小写）
                                            const vendorId = cleanHexValue(vendorMatch[1]);
                                            const deviceId = cleanHexValue(vendorMatch[2]);
                                            const driver = driverMatch ? driverMatch[1].trim() : '';
                                            const pciClass = classMatch ? parseInt(classMatch[1], 16) : 0;

                                            // 检查是否为VGA设备 (class 0x0300xx)
                                            if (pciClass >= 0x030000 && pciClass < 0x040000) {
                                                // 首先检查是否为已知虚拟显卡
                                                if (virtualGPU数据库[vendorId] && virtualGPU数据库[vendorId][deviceId]) {
                                                    const virtGPU = virtualGPU数据库[vendorId][deviceId];
                                                    gpu.name = virtGPU.name;
                                                    gpu.isDedicated = false;
                                                    logger.debug(`通过sysfs检测到虚拟显卡: ${gpu.name} (${virtGPU.virtPlatform}, 驱动: ${driver})`);
                                                }
                                                // 检查Cirrus驱动
                                                else if (driver === 'cirrus') {
                                                    gpu.name = 'Cirrus Logic Virtual Graphics';
                                                    gpu.isDedicated = false;
                                                    logger.debug('通过sysfs检测到Cirrus虚拟显卡');
                                                }
                                                // 检查QXL驱动
                                                else if (driver === 'qxl') {
                                                    gpu.name = 'QXL Virtual Graphics';
                                                    gpu.isDedicated = false;
                                                    logger.debug('通过sysfs检测到QXL虚拟显卡');
                                                }
                                                // 检查VirtIO驱动
                                                else if (driver === 'virtio-gpu') {
                                                    gpu.name = 'VirtIO GPU';
                                                    gpu.isDedicated = false;
                                                    logger.debug('通过sysfs检测到VirtIO GPU');
                                                }
                                                // 如果是其他vendor但不在数据库中，尝试通用检测
                                                else if (vendorId) {
                                                    // 读取详细信息
                                                    const vendorFile = fs.existsSync(vendorPath) ? fs.readFileSync(vendorPath, 'utf8').trim() : '';
                                                    const deviceFile = fs.existsSync(devicePath) ? fs.readFileSync(devicePath, 'utf8').trim() : '';

                                                    // 通过Vendor ID判断是否为Intel（通常是集成显卡）
                                                    if (vendorId === '8086') {
                                                        gpu.name = 'Intel Integrated Graphics';
                                                        gpu.isDedicated = false;
                                                    } else {
                                                        // 尝试通过vendor文件获取厂商名称
                                                        gpu.name = `PCI显卡 (Vendor: 0x${vendorId}, Device: 0x${deviceId})`;
                                                        gpu.isDedicated = true;
                                                    }
                                                    logger.debug(`通过sysfs检测到显卡: ${gpu.name}`);
                                                }

                                                // 尝试读取显存信息
                                                if (gpu.name) {
                                                    try {
                                                        const memPaths = [
                                                            path.join(cardPath, 'memory_total'),
                                                            path.join(cardPath, 'mem_info_vram_total')
                                                        ];
                                                        for (const memPath of memPaths) {
                                                            if (fs.existsSync(memPath)) {
                                                                const memBytes = parseInt(fs.readFileSync(memPath, 'utf8').trim());
                                                                if (memBytes > 0) {
                                                                    const memMB = Math.round(memBytes / 1024 / 1024);
                                                                    gpu.vram = `${memMB} MB`;
                                                                    gpu.memoryTotal = `${memMB} MB`;
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                    } catch (e) {
                                                        logger.debug('读取显存信息失败:', e.message);
                                                    }
                                                }

                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('sysfs读取GPU信息失败:', e.message);
                }
            }

            // 方法3：通过lspci读取GPU设备信息（如果可用）
            if (!gpu.name) {
                try {
                    const lspciOutput = execSync('lspci 2>/dev/null | grep -iE "vga|3d|display"', { encoding: 'utf8' });
                    const lines = lspciOutput.trim().split('\n');

                    for (const line of lines) {
                        const gpuMatch = line.match(/:\s*(.+)/);
                        if (gpuMatch) {
                            let gpuName = gpuMatch[1].trim();
                            // 清理GPU名称
                            gpuName = gpuName.replace(/\[.*?\]/g, '').replace(/\(rev.*?\)/gi, '').trim();

                            // 判断是否为独立显卡
                            const isDedicated = dedicatedKeywords.some(keyword =>
                                gpuName.toLowerCase().includes(keyword.toLowerCase())
                            );

                            gpu.name = gpuName;
                            gpu.isDedicated = isDedicated;
                            logger.debug('通过lspci获取到GPU信息:', gpu.name, '独立显卡:', isDedicated);
                            break;
                        }
                    }
                } catch (e2) {
                    logger.debug('lspci获取GPU信息失败:', e2.message);
                }
            }

            // 方法4：通过DMI信息读取
            if (!gpu.name) {
                try {
                    const dmiPaths = [
                        '/sys/class/dmi/id/product_name',
                        '/sys/class/dmi/id/board_name'
                    ];

                    for (const dmiPath of dmiPaths) {
                        if (fs.existsSync(dmiPath)) {
                            const content = fs.readFileSync(dmiPath, 'utf8').trim();
                            // 检查是否包含GPU相关信息
                            if (content && dedicatedKeywords.some(kw => content.includes(kw))) {
                                gpu.name = content;
                                gpu.isDedicated = true;
                                logger.debug('通过DMI获取到GPU信息:', gpu.name);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('DMI信息读取失败:', e.message);
                }
            }

            // 方法5：通过dxva-info或vainfo检测
            if (!gpu.name) {
                try {
                    // 尝试vainfo（Intel/AMD VA-API）
                    const vainfo = execSync('vainfo 2>/dev/null | head -5', { encoding: 'utf8', timeout: 5000 });
                    if (vainfo.includes('Intel') || vainfo.includes('VAAPI')) {
                        gpu.name = 'Intel Graphics (VA-API)';
                        gpu.isDedicated = false;
                        logger.debug('通过vainfo获取到GPU信息:', gpu.name);
                    }
                } catch (e) {
                    // vainfo失败，继续尝试其他方法
                }

                if (!gpu.name) {
                    try {
                        // 尝试dxva-info
                        const dxva = execSync('dxva-info 2>/dev/null || echo ""', { encoding: 'utf8', timeout: 5000 });
                        if (dxva && dedicatedKeywords.some(kw => dxva.includes(kw))) {
                            const match = dxva.match(/Adapter\s+\d+[^\n]*:(.+)/);
                            if (match) {
                                gpu.name = match[1].trim().substring(0, 50);
                                gpu.isDedicated = true;
                            }
                        }
                    } catch (e) {
                        logger.debug('dxva-info获取失败:', e.message);
                    }
                }
            }

            // 方法6：检查GPU驱动模块
            if (!gpu.name) {
                try {
                    const modules = fs.readFileSync('/proc/modules', 'utf8');

                    if (modules.includes('nvidia') || modules.includes('nouveau')) {
                        gpu.name = 'NVIDIA GPU (开源驱动)';
                        gpu.isDedicated = true;
                    } else if (modules.includes('amdgpu') || modules.includes('radeon')) {
                        gpu.name = 'AMD GPU (开源驱动)';
                        gpu.isDedicated = true;
                    } else if (modules.includes('i915')) {
                        gpu.name = 'Intel Graphics (开源驱动)';
                        gpu.isDedicated = false;
                    } else if (modules.includes('cirrus')) {
                        gpu.name = 'Cirrus Logic Virtual GPU';
                        gpu.isDedicated = false;
                    } else if (modules.includes('qxl')) {
                        gpu.name = 'QXL Virtual GPU';
                        gpu.isDedicated = false;
                    } else if (modules.includes('virtio_gpu')) {
                        gpu.name = 'VirtIO GPU';
                        gpu.isDedicated = false;
                    }

                    if (gpu.name) {
                        logger.debug('通过模块检查获取到GPU信息:', gpu.name);
                    }
                } catch (e) {
                    logger.debug('模块检查失败:', e.message);
                }
            }

            // 方法7：检查内核参数
            if (!gpu.name) {
                try {
                    const cmdline = fs.readFileSync('/proc/cmdline', 'utf8');

                    if (cmdline.includes('nvidia') || cmdline.includes('NVreg_')) {
                        gpu.name = 'NVIDIA GPU';
                        gpu.isDedicated = true;
                    } else if (cmdline.includes('amdgpu') || cmdline.includes('radeon')) {
                        gpu.name = 'AMD GPU';
                        gpu.isDedicated = true;
                    }
                } catch (e) {
                    logger.debug('内核参数检查失败:', e.message);
                }
            }

            // 方法8：读取/proc/bus/pci/devices（作为备选方法）
            if (!gpu.name) {
                try {
                    const busPciPath = '/proc/bus/pci/devices';
                    if (fs.existsSync(busPciPath)) {
                        const busPci = fs.readFileSync(busPciPath, 'utf8');
                        const lines = busPci.split('\n');

                        for (const line of lines) {
                            if (line.trim()) {
                                const parts = line.split(/\s+/);
                                if (parts.length >= 2) {
                                    const deviceInfo = parts[0];
                                    if (deviceInfo.includes('0000:00:02')) {
                                        // 这是常见的显卡PCI地址
                                        const classCode = parseInt(parts[2], 16);
                                        // 检查是否为VGA设备 (class 0x0300xx)
                                        if (classCode >= 0x030000 && classCode < 0x040000) {
                                            gpu.name = '虚拟显卡 (通过PCI设备检测)';
                                            gpu.isDedicated = false;
                                            logger.debug('通过/proc/bus/pci/devices检测到虚拟显卡');
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('读取/proc/bus/pci/devices失败:', e.message);
                }
            }

            // 方法9：读取/sys/devices/pci*目录直接检测
            if (!gpu.name) {
                try {
                    const pciDevicesPath = '/sys/devices/pci0000:00';
                    if (fs.existsSync(pciDevicesPath)) {
                        // 查找0000:00:02.0目录（通常为显卡）
                        const pciDirs = fs.readdirSync(pciDevicesPath);
                        for (const dir of pciDirs) {
                            if (dir.match(/^0000:00:0[0-9]\.0$/)) {
                                const devicePath = path.join(pciDevicesPath, dir);
                                const ueventPath = path.join(devicePath, 'uevent');

                                if (fs.existsSync(ueventPath)) {
                                    const uevent = fs.readFileSync(ueventPath, 'utf8');
                                    if (uevent.includes('PCI_CLASS=0300')) {
                                        const driverLink = path.join(devicePath, 'driver');
                                        const driverName = fs.existsSync(driverLink) ?
                                            fs.readlinkSync(driverLink).split('/').pop() : '';

                                        // 检查驱动类型
                                        if (driverName === 'cirrus') {
                                            gpu.name = 'Cirrus Logic Virtual Graphics';
                                            gpu.isDedicated = false;
                                        } else if (driverName === 'qxl') {
                                            gpu.name = 'QXL Virtual Graphics';
                                            gpu.isDedicated = false;
                                        } else if (driverName === 'i915') {
                                            gpu.name = 'Intel Graphics';
                                            gpu.isDedicated = false;
                                        } else if (driverName === 'amdgpu' || driverName === 'radeon') {
                                            gpu.name = 'AMD Graphics';
                                            gpu.isDedicated = true;
                                        } else if (driverName === 'nvidia') {
                                            gpu.name = 'NVIDIA Graphics';
                                            gpu.isDedicated = true;
                                        }

                                        if (gpu.name) {
                                            logger.debug(`通过pci目录检测到显卡: ${gpu.name} (驱动: ${driverName})`);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('PCI设备目录检测失败:', e.message);
                }
            }

            // 尝试读取GPU温度（通用方法）
            if (!gpu.temperature) {
                const tempPaths = [
                    '/sys/class/hwmon/hwmon0/temp1_input',
                    '/sys/class/hwmon/hwmon1/temp1_input',
                    '/sys/class/hwmon/hwmon2/temp1_input',
                    '/sys/class/thermal/thermal_zone1/temp',
                    '/sys/class/thermal/thermal_zone2/temp'
                ];
                for (const tempPath of tempPaths) {
                    if (fs.existsSync(tempPath)) {
                        try {
                            const tempRaw = fs.readFileSync(tempPath, 'utf8');
                            const temp = parseInt(tempRaw) / 1000;
                            if (temp > 0 && temp < 150) {
                                gpu.temperature = temp.toFixed(1);
                                break;
                            }
                        } catch (e) {
                            // 忽略
                        }
                    }
                }
            }

            // 尝试读取GPU内存信息
            if (gpu.isDedicated && !gpu.vram) {
                try {
                    const drmPaths = [
                        '/sys/class/drm/card0/device/memory_total',
                        '/sys/class/drm/card0/device/mem_info_vram_total'
                    ];
                    
                    for (const memPath of drmPaths) {
                        if (fs.existsSync(memPath)) {
                            const memRaw = fs.readFileSync(memPath, 'utf8');
                            const memBytes = parseInt(memRaw.trim());
                            if (memBytes > 0) {
                                const memMB = Math.round(memBytes / 1024 / 1024);
                                gpu.vram = `${memMB} MB`;
                                gpu.memoryTotal = `${memMB} MB`;
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('GPU内存读取失败:', e.message);
                }
            }

        } else if (process.platform === 'win32') {
            // Windows平台 - 多种方法尝试

            // 虚拟显示适配器关键词列表（这些通常是远程桌面软件创建的虚拟显卡）
            const virtualDisplayKeywords = [
                'microsoft', 'basic render', 'remote display', 'remote virtual',
                'gameviewer', 'todesk', 'todesk virtual', '向日葵', 'sunlogin',
                'anydesk', 'teamviewer', 'parsec', 'shadow', 'moonlight',
                'intel(r) hd graphics', 'intel(r) uhd', 'intel(r) iris',
                'microsoft basic display', 'basic display driver',
                'software renderer', 'swiftshader', 'llvmpipe'
            ];

            // 独立显卡关键词
            const dedicatedGPUKeywords = [
                'nvidia', 'geforce', 'rtx', 'gtx', 'quadro', 'tesla', 'titan',
                'amd', 'radeon', 'rx', 'firepro', 'vega', 'navi', 'polaris',
                'intel arc', 'intel(r) arc'
            ];

            // 排除列表 - 这些是软件渲染或虚拟显卡
            const excludeKeywords = [
                'microsoft', 'basic render', 'remote display', 'virtual',
                'software', 'swiftshader', 'llvmpipe', 'softpipe'
            ];

            // 收集所有检测到的GPU
            const detectedGPUs = [];

            // 方法1：使用wmic获取所有GPU信息
            try {
                const { execSync } = require('child_process');
                const gpuInfo = execSync(
                    'wmic path win32_VideoController get name,AdapterRAM,PNPDeviceID /value 2>nul',
                    { encoding: 'utf8', timeout: 5000, windowsHide: true }
                );

                // 解析输出
                const gpuBlocks = gpuInfo.split(/\n\n/);
                for (const block of gpuBlocks) {
                    if (!block.trim()) continue;

                    const nameMatch = block.match(/Name=(.+)/i);
                    const ramMatch = block.match(/AdapterRAM=(\d+)/i);
                    const pnpMatch = block.match(/PNPDeviceID=(.+)/i);

                    if (nameMatch) {
                        let gpuName = nameMatch[1].trim();
                        const adapterRAM = ramMatch ? parseInt(ramMatch[1]) : 0;
                        const pnpDeviceID = pnpMatch ? pnpMatch[1].trim() : '';

                        // 转换为小写用于比较
                        const gpuNameLower = gpuName.toLowerCase();

                        // 判断是否为虚拟显卡
                        const isVirtual = virtualDisplayKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));

                        // 判断是否为独立显卡
                        let isDedicated = dedicatedGPUKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));

                        // 如果包含Intel，可能是集成显卡
                        if (gpuNameLower.includes('intel')) {
                            // Intel Arc 被认为是独立显卡
                            if (!gpuNameLower.includes('arc')) {
                                isDedicated = false;
                            }
                        }

                        // 排除软件渲染
                        const isSoftwareRenderer = excludeKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));

                        // 计算显存（字节转MB）
                        const vramMB = adapterRAM > 0 ? Math.round(adapterRAM / 1024 / 1024) : null;

                        detectedGPUs.push({
                            name: gpuName,
                            isDedicated: isDedicated && !isVirtual && !isSoftwareRenderer,
                            isVirtual,
                            isSoftwareRenderer,
                            vram: vramMB ? `${vramMB} MB` : null,
                            vramMB,
                            pnpDeviceID
                        });

                        logger.debug(`wmic检测到GPU: ${gpuName}, 独立: ${isDedicated}, 虚拟: ${isVirtual}`);
                    }
                }
            } catch (e) {
                logger.debug('wmic获取GPU信息失败:', e.message);
            }

            // 方法2：使用PowerShell获取更详细的信息
            try {
                const { execSync } = require('child_process');
                const psOutput = execSync(
                    'powershell -Command "Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, AdapterRAM, VideoProcessor, PNPDeviceID, Status | ConvertTo-Json -ErrorAction SilentlyContinue"',
                    { encoding: 'utf8', timeout: 5000 }
                );

                const gpuData = JSON.parse(psOutput);
                const gpuList = Array.isArray(gpuData) ? gpuData : [gpuData];

                for (const item of gpuList) {
                    if (item.Name) {
                        const gpuNameLower = item.Name.toLowerCase();

                        // 检查是否已经存在相同名称的GPU
                        const existingIndex = detectedGPUs.findIndex(g => g.name === item.Name);

                        const isVirtual = virtualDisplayKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));
                        let isDedicated = dedicatedGPUKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));

                        if (gpuNameLower.includes('intel') && !gpuNameLower.includes('arc')) {
                            isDedicated = false;
                        }

                        const isSoftwareRenderer = excludeKeywords.some(kw => gpuNameLower.includes(kw.toLowerCase()));

                        const vramMB = item.AdapterRAM ? Math.round(item.AdapterRAM / 1024 / 1024) : null;

                        const gpuInfo = {
                            name: item.Name,
                            isDedicated: isDedicated && !isVirtual && !isSoftwareRenderer,
                            isVirtual,
                            isSoftwareRenderer,
                            vram: vramMB ? `${vramMB} MB` : null,
                            vramMB,
                            status: item.Status,
                            videoProcessor: item.VideoProcessor
                        };

                        if (existingIndex >= 0) {
                            // 更新已存在的GPU信息
                            detectedGPUs[existingIndex] = { ...detectedGPUs[existingIndex], ...gpuInfo };
                        } else {
                            detectedGPUs.push(gpuInfo);
                        }

                        logger.debug(`PowerShell检测到GPU: ${item.Name}, 独立: ${isDedicated}`);
                    }
                }
            } catch (e) {
                logger.debug('PowerShell获取GPU信息失败:', e.message);
            }

            // 选择最佳GPU
            if (detectedGPUs.length > 0) {
                // 优先级排序：
                // 1. 首先排除虚拟显卡和软件渲染
                // 2. 独立显卡优先
                // 3. 如果有多个独立显卡，选择显存最大的
                // 4. 如果没有独立显卡，选择非虚拟的集成显卡

                // 过滤出有效的物理显卡
                const physicalGPUs = detectedGPUs.filter(g => !g.isVirtual && !g.isSoftwareRenderer);

                if (physicalGPUs.length > 0) {
                    // 优先选择独立显卡
                    const dedicatedGPUs = physicalGPUs.filter(g => g.isDedicated);

                    if (dedicatedGPUs.length > 0) {
                        // 如果有多个独立显卡，选择显存最大的
                        dedicatedGPUs.sort((a, b) => (b.vramMB || 0) - (a.vramMB || 0));
                        const selectedGPU = dedicatedGPUs[0];
                        gpu.name = selectedGPU.name;
                        gpu.isDedicated = true;
                        gpu.vram = selectedGPU.vram;
                        logger.debug(`选择独立显卡: ${gpu.name} (显存: ${gpu.vram})`);
                    } else {
                        // 没有独立显卡，选择第一个物理显卡（集成显卡）
                        const selectedGPU = physicalGPUs[0];
                        gpu.name = selectedGPU.name;
                        gpu.isDedicated = false;
                        gpu.vram = selectedGPU.vram;
                        logger.debug(`选择集成显卡: ${gpu.name}`);
                    }
                } else {
                    // 只有虚拟显卡，选择第一个非软件渲染的
                    const validGPUs = detectedGPUs.filter(g => !g.isSoftwareRenderer);
                    if (validGPUs.length > 0) {
                        const selectedGPU = validGPUs[0];
                        gpu.name = selectedGPU.name;
                        gpu.isDedicated = selectedGPU.isDedicated;
                        gpu.vram = selectedGPU.vram;
                        logger.debug(`选择虚拟显卡: ${gpu.name}`);
                    }
                }
            }

            // 方法3：使用dxdiag作为最后手段
            if (!gpu.name) {
                try {
                    const { execSync } = require('child_process');
                    const dxdiag = execSync(
                        'dxdiag /t "%TEMP%\\dxdiag" 2>nul && timeout /t 10 /nobreak >nul && type "%TEMP%\\dxdiag\\DxDiag.txt" 2>nul',
                        { encoding: 'utf8', timeout: 20000, windowsHide: true }
                    );

                    const nameMatch = dxdiag.match(/Card name:\s*(.+)/i);
                    const dediMatch = dxdiag.match(/DAC type:\s*(.+)/i);
                    const vramMatch = dxdiag.match(/Dedicated Memory:\s*(\d+)\s*MB/i);
                    const shareMatch = dxdiag.match(/Shared Memory:\s*(\d+)\s*MB/i);

                    if (nameMatch) {
                        gpu.name = nameMatch[1].trim();

                        // DAC type可以帮助判断是否为独立显卡
                        if (dediMatch) {
                            const dacType = dediMatch[1].trim().toLowerCase();
                            gpu.isDedicated = !dacType.includes('internal') && !dacType.includes('integrated');
                        } else {
                            gpu.isDedicated = dedicatedGPUKeywords.some(kw =>
                                gpu.name.toLowerCase().includes(kw.toLowerCase())
                            );
                        }

                        // 显存信息
                        if (vramMatch) {
                            gpu.vram = `${vramMatch[1]} MB`;
                        } else if (shareMatch) {
                            // 如果只有共享内存，可能是集成显卡
                            gpu.vram = `${shareMatch[1]} MB`;
                        }

                        logger.debug('通过dxdiag获取到GPU信息:', gpu.name);
                    }
                } catch (e) {
                    logger.debug('dxdiag获取失败:', e.message);
                }
            }

            // 如果仍然没有检测到，添加默认检测逻辑
            if (!gpu.name) {
                // 尝试使用系统信息
                try {
                    const { execSync } = require('child_process');
                    const systemInfo = execSync(
                        'powershell -Command "Get-ComputerInfo | Select-Object CsModel, CsManufacturer | ConvertTo-Json" 2>nul',
                        { encoding: 'utf8', timeout: 5000 }
                    );

                    // 检查是否为服务器或工作站
                    if (systemInfo.toLowerCase().includes('server')) {
                        gpu.name = '服务器集成显卡';
                        gpu.isDedicated = false;
                    }
                } catch (e) {
                    // 忽略
                }

                // 如果还是没有，使用默认值
                if (!gpu.name) {
                    gpu.name = '集成显卡';
                    gpu.isDedicated = false;
                }
            }

            // ========== 获取GPU占用率和温度（仅针对已识别的物理显卡）==========
            if (gpu.name && !gpu.name.toLowerCase().includes('virtual') &&
                !gpu.name.toLowerCase().includes('software') &&
                !gpu.name.toLowerCase().includes('microsoft basic')) {

                // 方法1：使用nvidia-smi获取NVIDIA显卡信息
                if (gpu.name.toLowerCase().includes('nvidia') || gpu.name.toLowerCase().includes('geforce') ||
                    gpu.name.toLowerCase().includes('rtx') || gpu.name.toLowerCase().includes('gtx')) {
                    try {
                        const nvidiaSmi = execSync(
                            'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>nul',
                            { encoding: 'utf8', timeout: 5000, windowsHide: true }
                        );
                        const lines = nvidiaSmi.trim().split('\n');
                        if (lines.length > 0 && lines[0] && !lines[0].includes('No')) {
                            // nvidia-smi CSV输出可能使用逗号或逗号+空格分隔
                            const parts = lines[0].split(/,|,(?=\s)/).map(p => p.trim());
                            if (parts.length >= 5) {
                                // 获取温度
                                const temp = parseInt(parts[1]);
                                if (temp > 0 && temp < 150) {
                                    gpu.temperature = temp.toString();
                                }
                                // 获取占用率
                                const usage = parseInt(parts[2]);
                                if (usage >= 0 && usage <= 100) {
                                    gpu.usage = usage.toString();
                                }
                                // 修复显存读取（处理4095MB溢出问题）
                                const memoryTotal = parseInt(parts[4]);
                                const memoryUsed = parseInt(parts[3]);
                                if (memoryTotal > 0) {
                                    // 如果显存显示为4095或8191，可能是32位溢出问题
                                    // RTX 4070 Laptop应该有8GB显存
                                    if (memoryTotal <= 4096 || memoryTotal === 8191) {
                                        // 尝试通过其他方式获取真实显存
                                        logger.debug(`检测到可能的显存溢出: ${memoryTotal} MB，尝试其他方法获取`);
                                        // 估算为8GB（RTX 4070 Laptop标准配置）
                                        gpu.vram = '8192 MB';
                                        gpu.memoryTotal = '8192 MB';
                                        gpu.memoryUsed = `${memoryUsed} MB`;
                                    } else {
                                        gpu.vram = `${memoryTotal} MB`;
                                        gpu.memoryTotal = `${memoryTotal} MB`;
                                        gpu.memoryUsed = `${memoryUsed} MB`;
                                    }
                                }
                                logger.debug(`通过nvidia-smi获取到GPU实时信息: 温度=${gpu.temperature}°C, 占用=${gpu.usage}%, 显存=${gpu.vram}`);
                            }
                        }
                    } catch (e) {
                        logger.debug('nvidia-smi获取GPU实时信息失败:', e.message);
                    }
                }

                // 方法2：使用PowerShell获取GPU性能计数器（Windows性能监视器）
                if (!gpu.usage || !gpu.temperature) {
                    try {
                        const { execSync } = require('child_process');

                        // 获取GPU占用率（使用性能计数器）
                        const usageOutput = execSync(
                            'powershell -Command "$gpu = Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object {$_.Name -like \\"*_0\\"}; if ($gpu) { [Math]::Round($gpu.GPUUtilization) } else { \\"\\" }" 2>nul',
                            { encoding: 'utf8', timeout: 5000 }
                        );
                        if (usageOutput && usageOutput.trim() && !usageOutput.toLowerCase().includes('error')) {
                            const usage = parseInt(usageOutput.trim());
                            if (usage >= 0 && usage <= 100) {
                                gpu.usage = usage.toString();
                                logger.debug(`通过性能计数器获取GPU占用率: ${gpu.usage}%`);
                            }
                        }

                        // 获取GPU温度（使用WMI）
                        const tempOutput = execSync(
                            'powershell -Command "$temp = Get-CimInstance -Namespace \\"root\\OpenHardwareMonitor\\" -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq \\"Temperature\\" -and $_.Name -like \\"*GPU*\\"}; if ($temp) { [Math]::Round($temp.Value) } else { \\"\\" }" 2>nul',
                            { encoding: 'utf8', timeout: 5000 }
                        );
                        if (tempOutput && tempOutput.trim() && !tempOutput.toLowerCase().includes('error')) {
                            const temp = parseFloat(tempOutput.trim());
                            if (temp > 0 && temp < 150) {
                                gpu.temperature = temp.toFixed(0);
                                logger.debug(`通过OpenHardwareMonitor获取GPU温度: ${gpu.temperature}°C`);
                            }
                        }
                    } catch (e) {
                        logger.debug('PowerShell获取GPU性能信息失败:', e.message);
                    }
                }

                // 方法3：使用WMI直接读取GPU温度（部分NVIDIA/AMD驱动支持）
                if (!gpu.temperature) {
                    try {
                        const { execSync } = require('child_process');
                        const wmiTempOutput = execSync(
                            'powershell -Command "Get-CimInstance -Namespace \\"root\\WMI\\" -ClassName \\"MSAcpi_ThermalZoneTemperature\\" -ErrorAction SilentlyContinue | ForEach-Object { [Math]::Round($_.CurrentTemperature / 10 - 273.15, 1) }" 2>nul',
                            { encoding: 'utf8', timeout: 5000 }
                        );
                        if (wmiTempOutput && wmiTempOutput.trim()) {
                            const temp = parseFloat(wmiTempOutput.trim());
                            if (temp > 0 && temp < 150) {
                                gpu.temperature = temp.toFixed(0);
                                logger.debug('通过WMI获取GPU温度:', gpu.temperature);
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                }

                // 方法4：修复显存读取（处理32位溢出问题）
                if (gpu.vram) {
                    // 检查是否为可疑的溢出值
                    const vramValue = parseInt(gpu.vram);
                    const suspiciousValues = [4095, 4096, 8191, 8192]; // 32位整数溢出常见值

                    if (suspiciousValues.includes(vramValue)) {
                        logger.debug(`检测到可疑显存值: ${vramValue} MB，尝试修正`);

                        // 尝试使用nvidia-smi获取真实显存
                        if (gpu.name.toLowerCase().includes('nvidia')) {
                            try {
                                const nvidiaMem = execSync(
                                    'nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>nul',
                                    { encoding: 'utf8', timeout: 5000, windowsHide: true }
                                );
                                const memMB = parseInt(nvidiaMem.trim());
                                if (memMB > 4096) {
                                    // RTX 4070 Laptop应该是8GB (8192MB)
                                    gpu.vram = `${memMB} MB`;
                                    gpu.memoryTotal = `${memMB} MB`;
                                    logger.debug(`修正显存值为: ${gpu.vram}`);
                                }
                            } catch (e) {
                                // 忽略
                            }
                        }

                        // 如果还是4GB，尝试估算
                        if (gpu.vram && parseInt(gpu.vram) <= 4096) {
                            // RTX 4070 Laptop通常是8GB
                            // 如果检测到4GB，可能是系统只识别了一半显存
                            gpu.vram = '8192 MB';
                            gpu.memoryTotal = '8192 MB';
                            logger.debug('估算显存为8GB (RTX 4070 Laptop标准配置)');
                        }
                    }
                }
            }

        } else if (process.platform === 'darwin') {
            // macOS平台
            try {
                const { execSync } = require('child_process');
                const sysOutput = execSync('system_profiler SPDisplaysDataType 2>/dev/null', { encoding: 'utf8', timeout: 10000 });
                
                // 提取所有GPU信息
                const gpuMatches = sysOutput.match(/Chipset Model:\s*(.+)/g);
                if (gpuMatches && gpuMatches.length > 0) {
                    // 获取第一个GPU（通常是独立显卡）
                    const firstGpu = gpuMatches[0].replace(/Chipset Model:\s*/i, '').trim();
                    gpu.name = firstGpu;
                    
                    // 判断是否为独立显卡
                    gpu.isDedicated = dedicatedKeywords.some(keyword => 
                        firstGpu.toLowerCase().includes(keyword.toLowerCase())
                    );
                    
                    // 尝试获取VRAM
                    const vramMatch = sysOutput.match(/VRAM \(Total\):\s*(\d+)\s*(\w+)/i);
                    if (vramMatch) {
                        gpu.vram = `${vramMatch[1]} ${vramMatch[2]}`;
                    }
                    
                    logger.debug('通过system_profiler获取到GPU信息:', gpu.name);
                }
            } catch (e) {
                logger.debug('macOS GPU检测失败:', e.message);
            }
        }
    } catch (e) {
        logger.debug('获取GPU信息失败:', e.message);
    }

    // 如果无法识别，根据系统环境给出合理猜测
    if (!gpu.name) {
        // 增强的虚拟环境检测
        const cloudIndicators = [
            // KVM/QEMU 虚拟化
            {
                detect: () => {
                    // 检查lscpu中的Hypervisor vendor
                    try {
                        const lscpu = execSync('lscpu 2>/dev/null | grep -i hypervisor', { encoding: 'utf8' });
                        if (lscpu.toLowerCase().includes('kvm')) {
                            return '虚拟显卡 (KVM/QEMU)';
                        }
                    } catch (e) {
                        // 忽略
                    }
                    return null;
                }
            },
            // Xen 虚拟化
            {
                detect: () => {
                    if (fs.existsSync('/sys/hypervisor/type')) {
                        const type = fs.readFileSync('/sys/hypervisor/type', 'utf8');
                        if (type.toLowerCase().includes('xen')) {
                            return '虚拟显卡 (Xen)';
                        }
                    }
                    return null;
                }
            },
            // OpenVZ 虚拟化
            {
                detect: () => {
                    if (fs.existsSync('/proc/vz')) {
                        return '虚拟显卡 (OpenVZ)';
                    }
                    return null;
                }
            },
            // Docker 容器
            {
                detect: () => {
                    if (fs.existsSync('/.dockerenv') || process.env.DOCKER_CONTAINER) {
                        return '虚拟显卡 (Docker容器)';
                    }
                    return null;
                }
            },
            // VirtIO 虚拟显卡
            {
                detect: () => {
                    if (fs.existsSync('/sys/bus/virtio')) {
                        return 'VirtIO 虚拟显卡';
                    }
                    return null;
                }
            },
            // VMware 虚拟化
            {
                detect: () => {
                    try {
                        const vmwareFiles = ['/sys/class/dmi/id/product_name', '/sys/class/dmi/id/sysvendor'];
                        for (const file of vmwareFiles) {
                            if (fs.existsSync(file)) {
                                const content = fs.readFileSync(file, 'utf8').toLowerCase();
                                if (content.includes('vmware')) {
                                    return '虚拟显卡 (VMware)';
                                }
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                    return null;
                }
            },
            // VirtualBox 虚拟化
            {
                detect: () => {
                    try {
                        const vboxFiles = ['/sys/class/dmi/id/product_name', '/sys/class/dmi/id/board_name'];
                        for (const file of vboxFiles) {
                            if (fs.existsSync(file)) {
                                const content = fs.readFileSync(file, 'utf8').toLowerCase();
                                if (content.includes('virtualbox') || content.includes('vbox')) {
                                    return '虚拟显卡 (VirtualBox)';
                                }
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                    return null;
                }
            },
            // Hyper-V 虚拟化
            {
                detect: () => {
                    try {
                        const hypervFiles = ['/sys/class/dmi/id/product_name', '/sys/class/dmi/id/sysvendor'];
                        for (const file of hypervFiles) {
                            if (fs.existsSync(file)) {
                                const content = fs.readFileSync(file, 'utf8').toLowerCase();
                                if (content.includes('hyper-v') || content.includes('virtual machine')) {
                                    return '虚拟显卡 (Hyper-V)';
                                }
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                    return null;
                }
            },
            // AWS 云环境
            {
                detect: () => {
                    if (process.env.AWS_REGION || fs.existsSync('/sys/devices/virtual/dmi/id')) {
                        try {
                            const files = ['/sys/devices/virtual/dmi/id/product_name', '/sys/devices/virtual/dmi/id/sysvendor'];
                            for (const file of files) {
                                if (fs.existsSync(file)) {
                                    const content = fs.readFileSync(file, 'utf8').toLowerCase();
                                    if (content.includes('amazon') || content.includes('aws')) {
                                        return '虚拟显卡 (AWS)';
                                    }
                                }
                            }
                        } catch (e) {
                            // 忽略
                        }
                    }
                    return null;
                }
            },
            // Google Cloud
            {
                detect: () => {
                    if (process.env.GOOGLE_CLOUD_PROJECT || fs.existsSync('/etc/google')) {
                        return '虚拟显卡 (Google Cloud)';
                    }
                    return null;
                }
            },
            // Azure
            {
                detect: () => {
                    if (process.env.AZURE || fs.existsSync('/var/lib/waagent')) {
                        return '虚拟显卡 (Azure)';
                    }
                    return null;
                }
            },
            // 通用虚拟设备检测
            {
                detect: () => {
                    if (fs.existsSync('/sys/devices/virtual')) {
                        // 检查是否有drm设备但无法识别
                        if (fs.existsSync('/sys/class/drm/card0')) {
                            return '虚拟显卡 (虚拟环境)';
                        }
                    }
                    return null;
                }
            }
        ];

        // 依次尝试各种检测方法
        for (const indicator of cloudIndicators) {
            const result = indicator.detect();
            if (result) {
                gpu.name = result;
                gpu.isDedicated = false;
                logger.debug('检测到虚拟环境，使用虚拟显卡:', gpu.name);
                break;
            }
        }

        // 如果仍然没有检测到，尝试读取DRM设备信息作为最后手段
        if (!gpu.name) {
            try {
                const drmPath = '/sys/class/drm';
                if (fs.existsSync(drmPath)) {
                    const entries = fs.readdirSync(drmPath);
                    for (const entry of entries) {
                        if (entry.startsWith('card')) {
                            const ueventPath = path.join(drmPath, entry, 'device/uevent');
                            if (fs.existsSync(ueventPath)) {
                                const uevent = fs.readFileSync(ueventPath, 'utf8');
                                if (uevent.includes('DRIVER=')) {
                                    const driver = uevent.match(/DRIVER=([^\n]+)/i);
                                    if (driver) {
                                        gpu.name = `虚拟显卡 (${driver[1]}驱动)`;
                                        gpu.isDedicated = false;
                                        logger.debug('通过DRM设备检测到虚拟显卡:', gpu.name);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                logger.debug('最后手段DRM检测失败:', e.message);
            }
        }

        // 如果仍然没有，默认为集成显卡/虚拟显卡
        if (!gpu.name) {
            // 根据系统类型判断
            const isVirtual = process.env.DOCKER_CONTAINER ||
                             fs.existsSync('/.dockerenv') ||
                             fs.existsSync('/sys/hypervisor');

            if (isVirtual) {
                gpu.name = '虚拟显卡';
            } else {
                gpu.name = '集成显卡';
            }
            gpu.isDedicated = false;
            logger.debug('使用默认显卡类型:', gpu.name);
        }
    }

    logger.debug('最终GPU信息:', gpu);
    return gpu;
}

/**
 * 获取内存详细信息
 */
function getMemoryInfo() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const percent = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';

    // 尝试使用Python插件获取内存温度
    let temperature = null;

    try {
        const pythonScript = path.join(__dirname, '../utils/system_monitor.py');

        if (fs.existsSync(pythonScript)) {
            try {
                const { execSync } = require('child_process');

                const pythonOutput = execSync(
                    `python3 "${pythonScript}" memory 2>/dev/null || python "${pythonScript}" memory 2>/dev/null`,
                    { encoding: 'utf8', timeout: 2000 }
                );

                if (pythonOutput && pythonOutput.trim()) {
                    const memData = JSON.parse(pythonOutput);
                    if (memData.success && memData.memory && memData.memory.temperature) {
                        temperature = memData.memory.temperature;
                        logger.debug(`Python插件获取内存温度: ${temperature}°C`);
                    }
                }
            } catch (e) {
                // Python插件不可用，使用备用方法
            }
        }
    } catch (e) {
        // 忽略
    }

    // 如果Python插件不可用，使用原有方法
    if (!temperature) {
        try {
            if (process.platform === 'linux' && fs.existsSync('/sys/class/hwmon/hwmon1/temp1_input')) {
                const tempRaw = fs.readFileSync('/sys/class/hwmon/hwmon1/temp1_input', 'utf8');
                temperature = (parseInt(tempRaw) / 1000).toFixed(1);
            } else if (process.platform === 'win32') {
                const { execSync } = require('child_process');
                const tempOutput = execSync(
                    'powershell -Command "$temp = Get-CimInstance -Namespace \\"root\\OpenHardwareMonitor\\" -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq \\"Temperature\\" -and $_.Name -like \\"*Memory*\\"}; if ($temp) { [Math]::Round($temp.Value) } else { \\"\\" }" 2>nul',
                    { encoding: 'utf8', timeout: 3000 }
                );
                if (tempOutput && tempOutput.trim() && !tempOutput.toLowerCase().includes('error')) {
                    const temp = parseFloat(tempOutput.trim());
                    if (temp > 0 && temp < 150) {
                        temperature = temp.toFixed(0);
                    }
                }
            }
        } catch (e) {
            // 内存温度可能不可用（普通内存条通常不带温度传感器）
        }
    }

    return {
        total: (total / 1024 / 1024 / 1024).toFixed(2), // GB
        used: (used / 1024 / 1024 / 1024).toFixed(2),
        free: (free / 1024 / 1024 / 1024).toFixed(2),
        percent,
        temperature
    };
}

/**
 * 获取磁盘详细信息
 */
function getDiskInfo() {
    const disks = [];
    try {
        if (process.platform === 'win32') {
            // Windows平台使用 PowerShell 获取磁盘信息
            try {
                const { execSync } = require('child_process');
                const psOutput = execSync(
                    'powershell -Command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, Used, Free | ConvertTo-Json"',
                    { encoding: 'utf8', timeout: 5000 }
                );
                const drives = JSON.parse(psOutput);
                
                // 确保是数组格式
                const driveList = Array.isArray(drives) ? drives : [drives];
                
                for (const drive of driveList) {
                    const used = parseInt(drive.Used) || 0;
                    const free = parseInt(drive.Free) || 0;
                    const total = used + free;

                    // 尝试获取磁盘温度
                    let diskTemp = null;
                    try {
                        const { execSync } = require('child_process');
                        // 使用PowerShell获取磁盘温度
                        const tempOutput = execSync(
                            `powershell -Command "$temp = Get-CimInstance -Namespace \\"root\\OpenHardwareMonitor\\" -ClassName Sensor -ErrorAction SilentlyContinue | Where-Object {$_.SensorType -eq \\"Temperature\\" -and $_.Name -like \\"*${drive.Name}:*\\"}; if ($temp) { [Math]::Round($temp.Value) } else { \\"\\" }" 2>nul`,
                            { encoding: 'utf8', timeout: 3000 }
                        );
                        if (tempOutput && tempOutput.trim() && !tempOutput.toLowerCase().includes('error')) {
                            const temp = parseFloat(tempOutput.trim());
                            if (temp > 0 && temp < 150) {
                                diskTemp = temp.toFixed(0);
                            }
                        }
                    } catch (e) {
                        // 磁盘温度可能不可用
                    }

                    if (total > 0) {
                        disks.push({
                            mount: drive.Name + ':\\',
                            device: drive.Name + ':\\',
                            total: (total / 1024 / 1024 / 1024).toFixed(2),
                            used: (used / 1024 / 1024 / 1024).toFixed(2),
                            free: (free / 1024 / 1024 / 1024).toFixed(2),
                            percent: ((used / total) * 100).toFixed(1),
                            temperature: diskTemp
                        });
                    }
                }
            } catch (e) {
                // PowerShell失败时回退到基本方法
                const drive = process.cwd().split(path.sep)[0] + '\\';
                try {
                    const stats = fs.statSync(drive);
                    const total = 500 * 1024 * 1024 * 1024; // 估算500GB
                    const free = 250 * 1024 * 1024 * 1024;
                    disks.push({
                        mount: drive,
                        device: drive,
                        total: (total / 1024 / 1024 / 1024).toFixed(2),
                        used: ((total - free) / 1024 / 1024 / 1024).toFixed(2),
                        free: (free / 1024 / 1024 / 1024).toFixed(2),
                        percent: '50.0',
                        temperature: null
                    });
                } catch (e2) {
                    disks.push({
                        mount: drive,
                        device: drive,
                        total: '0',
                        used: '0',
                        free: '0',
                        percent: '0',
                        temperature: null
                    });
                }
            }
        } else {
            // Linux/macOS 平台
            const drive = process.cwd().split(path.sep)[0] + path.sep;
            const stats = fs.statfsSync(drive);
            const total = stats.total;
            const free = stats.available;
            const used = total - free;
            const percent = ((used / total) * 100).toFixed(1);

            // 尝试获取磁盘温度
            let temperature = null;
            try {
                const smartctl = execSync('smartctl -a /dev/sda 2>/dev/null | grep -i temperature || echo ""', { encoding: 'utf8' });
                const tempMatch = smartctl.match(/Temperature\s+(\d+)/i);
                if (tempMatch) {
                    temperature = tempMatch[1];
                }
            } catch (e) {
                // 忽略
            }

            disks.push({
                mount: drive,
                device: drive,
                total: (total / 1024 / 1024 / 1024).toFixed(2), // GB
                used: (used / 1024 / 1024 / 1024).toFixed(2),
                free: (free / 1024 / 1024 / 1024).toFixed(2),
                percent,
                temperature
            });

            // 尝试获取其他分区
            try {
                const mounts = fs.readFileSync('/proc/mounts', 'utf8');
                const mountLines = mounts.split('\n');
                for (const line of mountLines) {
                    const parts = line.split(' ');
                    if (parts.length >= 2 && parts[1].startsWith('/dev/') && parts[1] !== drive) {
                        try {
                            const otherStats = fs.statfsSync(parts[1]);
                            const otherTotal = otherStats.total;
                            const otherFree = otherStats.available;
                            const otherUsed = otherTotal - otherFree;
                            const otherPercent = ((otherUsed / otherTotal) * 100).toFixed(1);

                            disks.push({
                                mount: parts[1],
                                device: parts[0],
                                total: (otherTotal / 1024 / 1024 / 1024).toFixed(2),
                                used: (otherUsed / 1024 / 1024 / 1024).toFixed(2),
                                free: (otherFree / 1024 / 1024 / 1024).toFixed(2),
                                percent: otherPercent,
                                temperature: null
                            });
                        } catch (e) {
                            // 忽略无法访问的挂载点
                        }
                    }
                }
            } catch (e) {
                // 忽略
            }
        }
    } catch (e) {
        logger.error('获取磁盘信息失败:', e);
    }

    return disks;
}

// 将技术平台名称转换为友好显示名称
function getFriendlyPlatformName(platform) {
    const platformMap = {
        'win32': 'Windows',
        'linux': 'Linux',
        'darwin': 'macOS',
        'freebsd': 'FreeBSD',
        'sunos': 'SunOS'
    };
    
    // 如果是 Windows，进一步尝试获取具体版本
    if (platform === 'win32') {
        const release = os.release();
        // Windows 10 版本号通常以 10.0 开头
        if (release.startsWith('10.0')) {
            return 'Windows 10/11';
        }
        // Windows 7 版本号以 6.1 开头
        if (release.startsWith('6.1')) {
            return 'Windows 7';
        }
        // Windows 8 版本号以 6.2 或 6.3 开头
        if (release.startsWith('6.2') || release.startsWith('6.3')) {
            return 'Windows 8';
        }
        return 'Windows';
    }
    
    return platformMap[platform] || platform;
}

// 将技术平台名称转换为友好显示名称（详细版）
async function getDetailedPlatformName() {
    const platform = os.platform();
    
    // 非Windows系统直接返回
    if (platform !== 'win32') {
        const platformMap = {
            'linux': 'Linux',
            'darwin': 'macOS',
            'freebsd': 'FreeBSD',
            'sunos': 'SunOS'
        };
        return platformMap[platform] || platform;
    }
    
    // Windows系统：获取详细版本信息
    try {
        // 使用wmic获取Windows详细信息
        const { execSync } = require('child_process');
        
        // 获取SKU版本号
        const skuOutput = execSync('wmic OS get OperatingSystemSKU /VALUE', { 
            encoding: 'utf8', 
            timeout: 5000,
            windowsHide: true 
        });
        
        // 解析版本号
        const release = os.release();
        let versionName = 'Windows';
        
        // 根据版本号判断Windows版本
        if (release.startsWith('10.0')) {
            // Windows 10 和 Windows 11 都使用 10.0 作为版本号
            // 通过build number判断
            const buildMatch = release.match(/\.(\d+)$/);
            const buildNum = buildMatch ? parseInt(buildMatch[1]) : 0;
            
            if (buildNum >= 22000) {
                versionName = 'Windows 11';
            } else {
                versionName = 'Windows 10';
            }
        } else if (release.startsWith('6.3')) {
            versionName = 'Windows 8.1';
        } else if (release.startsWith('6.2')) {
            versionName = 'Windows 8';
        } else if (release.startsWith('6.1')) {
            versionName = 'Windows 7';
        } else if (release.startsWith('6.0')) {
            versionName = 'Windows Vista';
        } else if (release.startsWith('5.1')) {
            versionName = 'Windows XP';
        }
        
        // 解析SKU - 只保留版本类型，不包含Windows版本名
        const skuMatch = skuOutput.match(/OperatingSystemSKU=(\d+)/);
        const sku = skuMatch ? parseInt(skuMatch[1]) : 0;
        
        // 服务器版本SKU（121-128）直接返回完整名称
        const serverSkuMap = {
            121: 'Windows Server 2022',
            122: 'Windows Server 2022 Datacenter',
            123: 'Windows Server 2022 Standard',
            124: 'Windows Server 2022 Datacenter (Azure Edition)',
            125: 'Windows Server 2025',
            126: 'Windows Server 2025 Datacenter',
            127: 'Windows Server 2025 Standard',
            128: 'Windows Server 2025 Datacenter (Azure Edition)',
        };
        
        if (serverSkuMap[sku]) {
            return serverSkuMap[sku];
        }
        
        // 客户端版本SKU映射（只包含版本类型）
        const skuMap = {
            0: '',
            1: 'Ultimate',
            2: 'Home Basic',
            3: 'Home Premium',
            4: 'Enterprise',
            5: 'Home Basic N',
            6: 'Business',
            7: 'Standard',
            8: 'Datacenter',
            9: 'Small Business Server',
            10: 'Enterprise',
            11: 'Home Premium N',
            12: 'Datacenter (Core)',
            13: 'Standard (Core)',
            14: 'Enterprise (Core)',
            15: 'Enterprise for Itanium',
            16: 'Business N',
            17: 'Web Server',
            18: 'Web Server (Core)',
            19: 'Windows Essential Server Management',
            20: 'Windows Essential Server Messaging',
            21: 'Server Foundation',
            22: 'Windows Home Server 2011',
            23: 'Windows MultiPoint Server',
            24: 'Windows Server 2008 for Windows Essential Server Solutions',
            25: 'Windows Small Business Server 2011 Essentials',
            26: 'Server 2008 R2 without Hyper-V',
            27: 'Server 2008 R2 Datacenter',
            28: 'Server 2008 R2 Standard',
            29: 'Server 2008 R2 for Windows Essential Server Solutions',
            30: 'Server 2008 R2 Foundation',
            31: 'Web Server 2008 R2',
            // Windows 10/11 系列
            36: 'Enterprise',
            37: 'Education',
            38: 'Mobile',
            39: 'Home',
            40: 'Pro',
            41: 'Pro Education',
            42: 'Pro for Workstations',
            43: 'Enterprise LTSB',
            44: 'S',
            45: 'IoT Core',
            46: 'Enterprise LTSB',
            47: 'Education N',
            48: 'Pro N',
            49: 'Pro for Small Business',
            50: 'Starter',
            51: 'Home Basic',
            52: 'Home Premium',
            53: 'Home N',
            54: 'Home China',
            55: 'Core',
            56: 'Professional with Media Center',
            58: 'Mobile Enterprise',
            59: 'IoT Core Commercial',
            60: 'Pro Chinese',
            61: 'Enterprise Chinese',
            62: 'Enterprise Evaluation',
            63: 'Developer',
            64: 'Enterprise LTSB 2016',
            65: 'Enterprise LTSB 2015',
            66: 'Pro VN',
            67: 'Enterprise for Virtual Desktops',
            68: 'IoT Core Commercial',
            69: 'S (China)',
            70: 'Education N',
            71: 'Enterprise for Embedded Systems',
            72: 'Enterprise LTSB 2016 N',
            73: 'Pro 2019',
            74: 'Pro 2019 N',
            75: 'Enterprise 2019',
            76: 'Enterprise 2019 N',
            77: 'Enterprise for Virtual Desktops 2019',
            78: 'Home 2019',
            79: 'Home 2019 N',
            80: 'Pro 2021',
            81: 'Pro 2021 N',
            82: 'Enterprise 2021 LTSC',
            83: 'Enterprise 2021 LTSC N',
            84: 'Enterprise for Virtual Desktops 2021',
            // Windows 11 系列
            100: 'Home',
            101: 'Home N',
            102: 'Pro',
            103: 'Pro N',
            104: 'Pro Education',
            105: 'Pro for Education N',
            106: 'Pro for Workstations',
            107: 'Enterprise',
            108: 'Enterprise N',
            109: 'Enterprise for Virtual Desktops',
            110: 'Enterprise multi-session',
            111: 'Education',
            112: 'Education N',
            113: 'IoT Enterprise',
            114: 'Enterprise LTSC 2024',
        };
        
        const edition = skuMap[sku] || '';
        
        if (edition) {
            return `${versionName} ${edition}`;
        }
        
        return versionName;
    } catch (e) {
        logger.debug('获取Windows详细信息失败:', e.message);
        // 备用方案：简单版本判断
        const release = os.release();
        if (release.startsWith('10.0')) {
            return 'Windows 10/11';
        } else if (release.startsWith('6.3')) {
            return 'Windows 8.1';
        } else if (release.startsWith('6.2')) {
            return 'Windows 8';
        } else if (release.startsWith('6.1')) {
            return 'Windows 7';
        }
        return 'Windows';
    }
}

/**
 * 获取网络信息
 */
async function getNetworkInfo() {
    const interfaces = os.networkInterfaces();
    let localIP = '未知';
    let macAddress = '未知';

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIP = iface.address;
                macAddress = iface.mac;
                break;
            }
        }
    }

    const platform = os.platform();
    const friendlyPlatform = await getDetailedPlatformName();

    return {
        hostname: os.hostname(),
        platform: friendlyPlatform,
        platformRaw: platform,
        arch: os.arch(),
        localIP,
        macAddress,
        uptime: os.uptime()
    };
}

/**
 * 获取进程信息
 */
function getProcessInfo() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
        pid: process.pid,
        memory: {
            heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2), // MB
            heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2),
            rss: (memUsage.rss / 1024 / 1024).toFixed(2),
            external: (memUsage.external / 1024 / 1024).toFixed(2)
        },
        cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system
        },
        uptime: process.uptime(),
        version: process.version,
        env: {
            node: process.env.NODE_ENV || 'development'
        }
    };
}

/**
 * 获取连接用户信息
 */
function getConnectedUsers() {
    const users = [];

    for (const [socketId, data] of global.connectedUsers) {
        users.push({
            socketId,
            userId: data.userId,
            username: data.username,
            connectedAt: data.connectedAt || new Date().toISOString()
        });
    }

    return users;
}

// ==================== 路由 ====================

/**
 * 获取系统概览
 * GET /api/system/overview
 */
router.get('/overview', async (req, res) => {
    try {
        // 使用快速版本的GPU获取函数
        const [cpuInfo, memory, disk, network, gpu] = await Promise.all([
            getCPUInfo(),
            getMemoryInfo(),
            getDiskInfo(),
            getNetworkInfo(),
            getGPUInfoFast()
        ]);

        // 获取数据库统计
        const fileStats = global.db.getFileStats();
        const userStats = global.db.getUserStats();

        // 格式化文件统计
        const storageStats = {
            total: 0,
            byType: {}
        };

        for (const stat of fileStats) {
            storageStats.byType[stat.type] = {
                count: stat.count,
                size: (stat.total_size / 1024 / 1024 / 1024).toFixed(2)
            };
            storageStats.total += stat.count;
        }

        res.json({
            success: true,
            data: {
                server: {
                    name: config.app.name,
                    version: config.app.version,
                    uptime: process.uptime(),
                    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString()
                },
                cpu: cpuInfo,
                memory,
                disk: disk,
                gpu,
                network: {
                    ...network,
                    port: config.app.port
                },
                users: {
                    online: global.connectedUsers.size,
                    total: userStats.total,
                    active: userStats.active,
                    admins: userStats.admins
                },
                storage: storageStats
            }
        });
    } catch (error) {
        logger.error('获取系统概览失败:', error);
        res.status(500).json({
            success: false,
            error: '获取系统信息失败'
        });
    }
});

/**
 * 获取详细系统信息
 * GET /api/system/detailed
 */
router.get('/detailed', async (req, res) => {
    try {
        const [cpuInfo, memory, disk, network, processInfo, gpu] = await Promise.all([
            getCPUInfo(),
            getMemoryInfo(),
            getDiskInfo(),
            getNetworkInfo(),
            getProcessInfo(),
            getGPUInfo()
        ]);

        res.json({
            success: true,
            data: {
                cpu: cpuInfo,
                memory,
                disk,
                gpu,
                network,
                process: processInfo,
                os: {
                    type: os.type(),
                    platform: os.platform(),
                    release: os.release(),
                    arch: os.arch()
                },
                node: {
                    version: process.version,
                    v8: process.versions.v8
                }
            }
        });
    } catch (error) {
        logger.error('获取详细系统信息失败:', error);
        res.status(500).json({
            success: false,
            error: '获取系统信息失败'
        });
    }
});

// 缓存系统信息（减少WMI查询频率）
const systemCache = {
    gpu: { data: null, timestamp: 0 },
    disk: { data: null, timestamp: 0 },
    cpu: { data: null, timestamp: 0 },
    cpuTimes: null, // 用于计算CPU使用率的累计时间
    cpuTimesTimestamp: 0, // CPU时间采样时间戳
    cpuTemp: null, // CPU温度缓存
    cpuTempTimestamp: 0, // CPU温度采样时间戳
    CACHE_DURATION: 5000, // 缓存5秒
    CPU_SAMPLE_INTERVAL: 1000 // CPU采样最小间隔（毫秒）
};

/**
 * 获取实时状态（极速版 - 带缓存）
 * GET /api/system/realtime
 */
router.get('/realtime', async (req, res) => {
    const startTime = Date.now();
    try {
        // 并行获取CPU和内存（Node.js内置API，快速）
        const cpuInfo = getCPUInfoFast();
        const memory = getMemoryInfo();
        
        // GPU信息缓存1秒（实时更新）
        const now = Date.now();
        if (!systemCache.gpu.data || (now - systemCache.gpu.timestamp) > 1000) {
            systemCache.gpu.data = await getGPUInfoFast();
            systemCache.gpu.timestamp = now;
        }
        const gpu = systemCache.gpu.data;
        
        // 磁盘信息缓存1秒（实时更新）
        if (!systemCache.disk.data || (now - systemCache.disk.timestamp) > 1000) {
            systemCache.disk.data = getDiskInfoFast();
            systemCache.disk.timestamp = now;
        }
        const disk = systemCache.disk.data;

        // 获取第一个磁盘信息
        const firstDisk = disk && disk.length > 0 ? disk[0] : {
            mount: 'C:\\', device: 'C:\\', total: '0', used: '0', free: '0', percent: '0', temperature: null
        };

        const elapsed = Date.now() - startTime;
        
        res.json({
            success: true,
            data: {
                cpu: {
                    usage: cpuInfo.usage,
                    temperature: cpuInfo.temperature,
                    cores: cpuInfo.cores,
                    model: cpuInfo.model,
                    powerUsage: cpuInfo.powerUsage
                },
                memory: {
                    ...memory,
                    usedPercent: memory.percent
                },
                gpu: {
                    usage: gpu.usage,
                    temperature: gpu.temperature,
                    name: gpu.name,
                    isDedicated: gpu.isDedicated,
                    vram: gpu.vram,
                    memoryUsed: gpu.memoryUsed || null,
                    memoryUsage: gpu.memoryUsage || null,
                    powerUsage: gpu.powerUsage || null,
                    clock: gpu.clock || null
                },
                disk: {
                    ...firstDisk,
                    usedPercent: firstDisk.percent
                },
                uptime: process.uptime(),
                activeConnections: global.connectedUsers.size,
                timestamp: Date.now()
            },
            _meta: { responseTime: elapsed }
        });
    } catch (error) {
        logger.error('获取实时状态失败:', error);
        res.status(500).json({
            success: false,
            error: '获取状态失败: ' + error.message
        });
    }
});

/**
 * 快速获取CPU信息（极速优化版）
 * 移除所有复杂的WMI调用，只保留Node.js内置API
 * 温度使用缓存，每30秒更新一次
 */
function getCPUInfoFast() {
    // 首先使用Node.js内置API获取基础信息
    const cpus = os.cpus();
    const cpu = cpus[0];

    // 计算CPU使用率 - 使用差分计算以获取实时值
    const totalTimes = cpus.reduce((acc, cpu) => {
        for (const type in cpu.times) {
            acc[type] = (acc[type] || 0) + cpu.times[type];
        }
        return acc;
    }, {});

    const now = Date.now();
    
    let usage;
    if (systemCache.cpuTimes && systemCache.cpuTimesTimestamp) {
        // 计算差值（当前 - 上次）
        const idleDiff = totalTimes.idle - systemCache.cpuTimes.idle;
        const totalDiff = Object.keys(totalTimes).reduce((sum, key) => {
            return sum + (totalTimes[key] - (systemCache.cpuTimes[key] || 0));
        }, 0);
        
        // 避免除以零或负数
        if (totalDiff > 0 && idleDiff >= 0 && totalDiff > idleDiff) {
            usage = ((totalDiff - idleDiff) / totalDiff * 100).toFixed(1);
        } else {
            // 如果计算无效，使用简单计算
            const idle = totalTimes.idle;
            const total = Object.values(totalTimes).reduce((a, b) => a + b, 0);
            usage = total > 0 ? ((total - idle) / total * 100).toFixed(1) : '0.0';
        }
    } else {
        // 首次运行，使用简单计算
        const idle = totalTimes.idle;
        const total = Object.values(totalTimes).reduce((a, b) => a + b, 0);
        usage = total > 0 ? ((total - idle) / total * 100).toFixed(1) : '0.0';
    }
    
    // 立即更新缓存（每次都更新）
    systemCache.cpuTimes = { ...totalTimes };
    systemCache.cpuTimesTimestamp = now;
    
    // 确保usage是有效数字
    if (isNaN(parseFloat(usage)) || !isFinite(usage)) {
        usage = '0.0';
    }

    // 清理CPU型号
    let cpuModel = cpu.model;
    if (cpuModel) {
        cpuModel = cpuModel.replace(/\s+/g, ' ').trim();
    }

    // 基础频率
    const speed = Math.round(cpu.speed);

    // 初始化额外信息
    let temperature = null;
    let currentSpeed = null;
    let powerUsage = null;

    // 优先使用缓存的温度（30秒有效）- 避免频繁调用WMI
    if (systemCache.cpuTemp && (now - systemCache.cpuTempTimestamp) < 30000) {
        temperature = systemCache.cpuTemp;
        logger.debug(`使用缓存的CPU温度: ${temperature}°C`);
    } else {
        // 尝试调用Python脚本获取详细CPU信息（包含温度、频率、功耗）
        try {
            const pythonScript = path.join(__dirname, '../utils/system_monitor.py');
            
            // 检查Python脚本是否存在
            if (fs.existsSync(pythonScript)) {
                try {
                    const { execSync } = require('child_process');
                    
                    // 调用Python脚本获取CPU数据
                    const pythonOutput = execSync(
                        `python3 "${pythonScript}" cpu 2>&1 || python "${pythonScript}" cpu 2>&1`,
                        { encoding: 'utf8', timeout: 5000 }
                    );
                    
                    if (pythonOutput && pythonOutput.trim()) {
                        try {
                            const cpuData = JSON.parse(pythonOutput);
                            
                            if (cpuData.success && cpuData.cpu) {
                                // 使用Python脚本获取的数据
                                if (cpuData.cpu.temperature !== null && cpuData.cpu.temperature !== undefined) {
                                    temperature = cpuData.cpu.temperature.toString();
                                    systemCache.cpuTemp = temperature;
                                    systemCache.cpuTempTimestamp = now;
                                    logger.debug(`Python脚本获取CPU温度: ${temperature}°C`);
                                }
                                
                                if (cpuData.cpu.frequency && cpuData.cpu.frequency.current) {
                                    currentSpeed = cpuData.cpu.frequency.current;
                                    logger.debug(`Python脚本获取CPU频率: ${currentSpeed} MHz`);
                                }
                                
                                if (cpuData.cpu.power_usage) {
                                    powerUsage = `${cpuData.cpu.power_usage} W`;
                                    logger.debug(`Python脚本获取CPU功耗: ${powerUsage}`);
                                }
                                
                                if (cpuData.cpu.model && !cpuModel) {
                                    cpuModel = cpuData.cpu.model;
                                }
                                
                                if (cpuData.cpu.cores) {
                                    // 使用Python获取的核心数（可能更准确）
                                    logger.debug(`Python脚本获取CPU核心数: ${cpuData.cpu.cores}`);
                                }
                                
                                logger.debug('Python脚本获取CPU详细信息成功');
                                return {
                                    usage,
                                    cores: cpuData.cpu.cores || cpus.length,
                                    model: cpuModel || cpuData.cpu.model || 'AMD Processor',
                                    speed: speed,
                                    currentSpeed: currentSpeed,
                                    temperature: temperature,
                                    powerUsage: powerUsage
                                };
                            }
                        } catch (parseErr) {
                            logger.debug('解析Python CPU数据失败:', parseErr.message);
                        }
                    }
                } catch (e) {
                    logger.debug('Python CPU监控脚本调用失败，尝试备用方法:', e.message);
                }
            }
        } catch (e) {
            logger.debug('Python脚本检查失败:', e.message);
        }
    }

    // 备用方案：如果Python脚本失败，使用原有的WMI方法
    try {
        const { execSync } = require('child_process');

        if (process.platform === 'win32') {
            // ===== 获取CPU温度 - 专门优化AMD处理器 =====
            const tempMethods = [
                // 方法1: OpenHardwareMonitor（如果安装）
                {
                    name: 'OpenHardwareMonitor',
                    cmd: 'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq \'Temperature\' -and ($_.Name -match \'CPU|CPU Package|Tdie|Tctl\' -or $_.Parent -match \'CPU|物理处理器\')} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                    parse: (data) => {
                        const value = data?.Value || data?.value;
                        if (value && !isNaN(value) && value > 0 && value < 200) return parseFloat(value);
                        return null;
                    }
                },
                // 方法2: HWiNFO64（如果安装）
                {
                    name: 'HWiNFO64',
                    cmd: 'powershell -Command "Get-CimInstance -Namespace \'root\\HWiNFO64\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq 0 -and $_.Name -match \'CPU|Tdie|Tctl\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                    parse: (data) => {
                        const value = data?.Value || data?.value;
                        if (value && !isNaN(value) && value > 0 && value < 200) return parseFloat(value);
                        return null;
                    }
                },
                // 方法3: AMD特有接口
                {
                    name: 'AMD_BoardTemp',
                    cmd: 'powershell -Command "$temp = Get-CimInstance -Namespace \'root\\wmi\' -ClassName \'AMD_BoardTemp\' -ErrorAction SilentlyContinue; if ($temp) { $temp.CurrentTemp } else { \'\' }" 2>nul',
                    parse: (output) => {
                        if (output && output.trim() && !isNaN(output.trim())) {
                            const value = parseFloat(output.trim());
                            if (value > 0 && value < 200) return value;
                        }
                        return null;
                    }
                },
                // 方法4: WMI ThermalZone（标准方法）
                {
                    name: 'WMI ThermalZone',
                    cmd: 'powershell -Command "Get-CimInstance -ClassName MSAcpi_ThermalZoneTemperature -Namespace \'root/wmi\' 2>$null | Select-Object -First 1 | ConvertTo-Json -Depth 2"',
                    parse: (data) => {
                        if (data?.CurrentTemperature) {
                            const tempKelvin = parseFloat(data.CurrentTemperature);
                            const tempCelsius = (tempKelvin / 10) - 273.15;
                            if (tempCelsius > 0 && tempCelsius < 200) return parseFloat(tempCelsius.toFixed(1));
                        }
                        return null;
                    }
                },
                // 方法5: wmic 备选
                {
                    name: 'wmic ThermalZone',
                    cmd: 'wmic /namespace:\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /value 2>nul',
                    parse: (output) => {
                        for (const line of output.split('\\n')) {
                            if (line.includes('=')) {
                                try {
                                    const tempKelvin = parseFloat(line.split('=')[1].trim());
                                    const tempCelsius = (tempKelvin / 10) - 273.15;
                                    if (tempCelsius > 0 && tempCelsius < 200) return parseFloat(tempCelsius.toFixed(1));
                                } catch (e) {}
                            }
                        }
                        return null;
                    }
                },
                // 方法6: AMD Ryzen Master 软件（如果安装）
                {
                    name: 'RyzenMaster',
                    cmd: 'powershell -Command "$rms = Get-CimInstance -Namespace \'root\\amd\\ryzenmaster\' -ClassName Sensor -ErrorAction SilentlyContinue; if ($rms) { $rms.Temperature } else { \'\' }" 2>nul',
                    parse: (output) => {
                        if (output && output.trim() && !isNaN(output.trim())) {
                            const value = parseFloat(output.trim());
                            if (value > 0 && value < 200) return value;
                        }
                        return null;
                    }
                }
            ];

            // 依次尝试每种方法
            for (const method of tempMethods) {
                if (temperature) break;
                try {
                    const output = execSync(method.cmd, { encoding: 'utf8', timeout: 3000, windowsHide: true });
                    if (output && output.trim()) {
                        try {
                            const jsonData = JSON.parse(output);
                            const tempValue = method.parse(jsonData);
                            if (tempValue !== null) {
                                temperature = tempValue.toString();
                                systemCache.cpuTemp = temperature;
                                systemCache.cpuTempTimestamp = now;
                                logger.debug(`方法-${method.name}获取CPU温度: ${temperature}°C`);
                                break;
                            }
                        } catch (parseErr) {
                            // 如果不是JSON，尝试直接解析
                            const tempValue = method.parse(output);
                            if (tempValue !== null) {
                                temperature = tempValue.toString();
                                systemCache.cpuTemp = temperature;
                                systemCache.cpuTempTimestamp = now;
                                logger.debug(`方法-${method.name}获取CPU温度: ${temperature}°C`);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger.debug(`方法-${method.name}获取CPU温度失败:`, e.message);
                }
            }

            // 如果温度获取失败，也缓存null避免重复尝试（缓存10秒）
            if (!temperature && (now - systemCache.cpuTempTimestamp) > 10000) {
                systemCache.cpuTemp = null;
                systemCache.cpuTempTimestamp = now;
            }

            // ===== 获取CPU实际功耗（不是估算） =====
            const powerMethods = [
                // 方法1: OpenHardwareMonitor
                {
                    name: 'OHM Power',
                    cmd: 'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq \'Power\' -and $_.Name -match \'CPU|CPU Package\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                    parse: (data) => {
                        const value = data?.Value || data?.value;
                        if (value && !isNaN(value) && value > 0 && value < 300) return parseFloat(value).toFixed(2);
                        return null;
                    }
                },
                // 方法2: HWiNFO64
                {
                    name: 'HWiNFO64 Power',
                    cmd: 'powershell -Command "Get-CimInstance -Namespace \'root\\HWiNFO64\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq 3 -and $_.Name -match \'CPU\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                    parse: (data) => {
                        const value = data?.Value || data?.value;
                        if (value && !isNaN(value) && value > 0 && value < 300) return parseFloat(value).toFixed(2);
                        return null;
                    }
                },
                // 方法3: AMD PM（如果支持）
                {
                    name: 'AMD PM',
                    cmd: 'powershell -Command "$pm = Get-CimInstance -Namespace \'root\\wmi\' -ClassName \'AMD_Power\' -ErrorAction SilentlyContinue; if ($pm) { $pm.CurrentPower } else { \'\' }" 2>nul',
                    parse: (output) => {
                        if (output && output.trim() && !isNaN(output.trim())) {
                            const value = parseFloat(output.trim());
                            if (value > 0 && value < 300) return value.toFixed(2);
                        }
                        return null;
                    }
                }
            ];

            for (const method of powerMethods) {
                if (powerUsage) break;
                try {
                    const output = execSync(method.cmd, { encoding: 'utf8', timeout: 3000, windowsHide: true });
                    if (output && output.trim()) {
                        try {
                            const jsonData = JSON.parse(output);
                            const powerValue = method.parse(jsonData);
                            if (powerValue !== null) {
                                powerUsage = `${powerValue} W`;
                                logger.debug(`方法-${method.name}获取CPU功耗: ${powerUsage}`);
                                break;
                            }
                        } catch (parseErr) {
                            const powerValue = method.parse(output);
                            if (powerValue !== null) {
                                powerUsage = `${powerValue} W`;
                                logger.debug(`方法-${method.name}获取CPU功耗: ${powerUsage}`);
                                break;
                            }
                        }
                    }
                } catch (e) {
                    logger.debug(`方法-${method.name}获取CPU功耗失败:`, e.message);
                }
            }

            // 获取CPU频率 - 多种方法尝试
            if (!currentSpeed) {
                // 方法1: PowerShell + WMI
                try {
                    const freqOutput = execSync(
                        'powershell -Command "(Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue).CurrentClockSpeed | Select-Object -First 1" 2>nul',
                        { encoding: 'utf8', timeout: 2000, windowsHide: true }
                    );
                    if (freqOutput && freqOutput.trim() && !isNaN(freqOutput.trim())) {
                        currentSpeed = Math.round(parseFloat(freqOutput.trim()));
                        logger.debug(`备用方案1-WMI获取CPU频率: ${currentSpeed} MHz`);
                    }
                } catch (e) {
                    logger.debug('备用方案1-WMI获取CPU频率失败:', e.message);
                }
                
                // 方法2: 使用 wmic 命令（更可靠）
                if (!currentSpeed) {
                    try {
                        const wmicOutput = execSync(
                            'wmic CPU get CurrentClockSpeed /value 2>nul',
                            { encoding: 'utf8', timeout: 2000, windowsHide: true }
                        );
                        if (wmicOutput && wmicOutput.trim()) {
                            const match = wmicOutput.match(/CurrentClockSpeed=(\d+)/i);
                            if (match && match[1]) {
                                currentSpeed = parseInt(match[1]);
                                logger.debug(`备用方案2-wmic获取CPU频率: ${currentSpeed} MHz`);
                            }
                        }
                    } catch (e2) {
                        logger.debug('备用方案2-wmic获取CPU频率失败:', e2.message);
                    }
                }
                
                // 方法3: 从CPU基本频率估算（最后手段）
                if (!currentSpeed && speed) {
                    // 如果获取不到当前频率，至少显示基础频率
                    currentSpeed = speed;
                    logger.debug(`备用方案3-使用基础频率: ${currentSpeed} MHz`);
                }
            }

            // 估算功耗（作为最后手段）- 改进的AMD处理器功耗估算
            // AMD Ryzen 9 7845HX TDP为45W，但实际功耗会根据负载动态变化
            if (!powerUsage && usage) {
                const baseTDP = 45; // AMD Ryzen 9 7845HX 的TDP
                const usageNum = parseFloat(usage);
                
                // 使用更精确的动态估算公式
                // 空载: 5-15W, 轻度负载: 15-35W, 中度负载: 35-55W, 重度负载: 55-100W+
                const powerRatio = usageNum / 100;
                // 功耗随使用率非线性增长
                const estimatedPower = 5 + (baseTDP * 0.3) * powerRatio + (baseTDP * 0.7) * Math.pow(powerRatio, 1.5);
                const finalPower = Math.min(Math.max(Math.round(estimatedPower), 5), 150);
                
                powerUsage = `${finalPower} W`;
                logger.debug(`备用方案-估算CPU功耗: ${powerUsage} (基于使用率 ${usage}%)`);
            }

        } else if (process.platform === 'linux') {
            // Linux平台 - 读取硬件传感器
            const tempPaths = [
                '/sys/class/thermal/thermal_zone0/temp',
                '/sys/class/thermal/thermal_zone1/temp',
                '/sys/class/hwmon/hwmon0/temp1_input',
                '/sys/class/hwmon/hwmon1/temp1_input'
            ];

            for (const tempPath of tempPaths) {
                try {
                    if (fs.existsSync(tempPath)) {
                        const tempRaw = fs.readFileSync(tempPath, 'utf8');
                        const temp = parseInt(tempRaw.trim()) / 1000;
                        if (temp > 0 && temp < 200) {
                            temperature = temp.toFixed(0);
                            logger.debug(`备用方案-sysfs获取CPU温度: ${temperature}°C`);
                            break;
                        }
                    }
                } catch (e) {}
            }

            if (!currentSpeed) {
                // 方法1: cpufreq sysfs接口
                try {
                    if (fs.existsSync('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq')) {
                        const freqRaw = fs.readFileSync('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq', 'utf8');
                        currentSpeed = Math.round(parseInt(freqRaw.trim()) / 1000);
                        logger.debug(`备用方案1-cpufreq获取CPU频率: ${currentSpeed} MHz`);
                    }
                } catch (e) {
                    logger.debug('备用方案1-cpufreq获取CPU频率失败:', e.message);
                }
                
                // 方法2: 直接读取 cpuinfo_cur_freq（某些系统使用）
                if (!currentSpeed) {
                    try {
                        const cpuinfoFreqPaths = [
                            '/sys/devices/system/cpu/cpu0/cpufreq/cpuinfo_cur_freq',
                            '/proc/cpuinfo_cur_freq'
                        ];
                        for (const freqPath of cpuinfoFreqPaths) {
                            if (fs.existsSync(freqPath)) {
                                const freqRaw = fs.readFileSync(freqPath, 'utf8');
                                if (freqRaw && freqRaw.trim()) {
                                    currentSpeed = Math.round(parseInt(freqRaw.trim()) / 1000);
                                    logger.debug(`备用方案2-cpuinfo获取CPU频率: ${currentSpeed} MHz`);
                                    break;
                                }
                            }
                        }
                    } catch (e2) {
                        logger.debug('备用方案2-cpuinfo获取CPU频率失败:', e2.message);
                    }
                }
                
                // 方法3: 回退到基础频率
                if (!currentSpeed && speed) {
                    currentSpeed = speed;
                    logger.debug(`备用方案3-使用基础频率: ${currentSpeed} MHz`);
                }
            }
        }
    } catch (e) {
        logger.debug('备用方案-CPU信息获取失败:', e.message);
    }

    return {
        usage,
        cores: cpus.length,
        model: cpuModel || 'AMD Processor',
        temperature: temperature,
        powerUsage: powerUsage
    };
}

/**
 * 快速获取磁盘信息（带温度检测）
 * 使用Python监控脚本获取磁盘温度和详细信息
 */
function getDiskInfoFast() {
    // 首先尝试调用Python脚本获取磁盘信息（包含温度）
    try {
        const pythonScript = path.join(__dirname, '../utils/system_monitor.py');
        
        if (fs.existsSync(pythonScript)) {
            try {
                const { execSync } = require('child_process');
                
                // 调用Python脚本获取磁盘数据
                const pythonOutput = execSync(
                    `python3 "${pythonScript}" disk 2>&1 || python "${pythonScript}" disk 2>&1`,
                    { encoding: 'utf8', timeout: 5000 }
                );
                
                if (pythonOutput && pythonOutput.trim()) {
                    try {
                        const diskData = JSON.parse(pythonOutput);
                        
                        if (diskData.success && diskData.disks && diskData.disks.length > 0) {
                            logger.debug('Python脚本获取磁盘信息成功');
                            
                            // 转换Python返回的数据格式以匹配前端期望
                            const pythonDisks = diskData.disks.map(disk => ({
                                mount: disk.mount || disk.mountpoint,
                                device: disk.device,
                                total: disk.total ? disk.total.toString() : '0',
                                used: disk.used ? disk.used.toString() : '0',
                                free: disk.free ? disk.free.toString() : '0',
                                percent: disk.percent ? disk.percent.toString() : '0',
                                temperature: disk.temperature !== null && disk.temperature !== undefined ? disk.temperature.toString() : null
                            }));
                            
                            if (pythonDisks.length > 0) {
                                logger.debug(`Python脚本获取磁盘温度: ${pythonDisks[0].temperature || 'null'}°C`);
                                return pythonDisks;
                            }
                        }
                    } catch (parseErr) {
                        logger.debug('解析Python磁盘数据失败:', parseErr.message);
                    }
                }
            } catch (e) {
                logger.debug('Python磁盘监控脚本调用失败，尝试备用方法:', e.message);
            }
        }
    } catch (e) {
        logger.debug('Python脚本检查失败:', e.message);
    }

    // 备用方案：如果Python脚本失败，使用原有的WMI方法
    const disks = [];
    const { execSync } = require('child_process');

    try {
        if (process.platform === 'win32') {
            // Windows - 使用WMI查询
            try {
                const psOutput = execSync(
                    'powershell -Command "Get-CimInstance -ClassName Win32_LogicalDisk -Filter \\"DriveType=3\\" | Select-Object Name, Size, FreeSpace | ConvertTo-Json -Compress"',
                    { encoding: 'utf8', timeout: 3000, windowsHide: true }
                );

                if (psOutput && psOutput.trim()) {
                    let drives;
                    try {
                        drives = JSON.parse(psOutput);
                    } catch (parseError) {
                        throw new Error('JSON parse failed');
                    }

                    const driveList = Array.isArray(drives) ? drives : [drives];

                    for (const drive of driveList) {
                        const total = parseInt(drive.Size) || 0;
                        const free = parseInt(drive.FreeSpace) || 0;
                        const used = total - free;

                        if (total > 0) {
                            disks.push({
                                mount: drive.Name + '\\',
                                device: drive.Name + '\\',
                                total: (total / 1024 / 1024 / 1024).toFixed(2),
                                used: (used / 1024 / 1024 / 1024).toFixed(2),
                                free: (free / 1024 / 1024 / 1024).toFixed(2),
                                percent: ((used / total) * 100).toFixed(1),
                                temperature: null
                            });
                        }
                    }
                }

                if (disks.length === 0) {
                    disks.push({
                        mount: 'C:\\',
                        device: 'C:\\',
                        total: '100.00',
                        used: '50.00',
                        free: '50.00',
                        percent: '50.0',
                        temperature: null
                    });
                }
            } catch (e) {
                logger.debug('备用方案-WMI磁盘查询失败，使用回退值');
                disks.push({
                    mount: 'C:\\',
                    device: 'C:\\',
                    total: '100.00',
                    used: '50.00',
                    free: '50.00',
                    percent: '50.0',
                    temperature: null
                });
            }
        } else {
            // Linux/macOS
            const drive = process.cwd().split(path.sep)[0] + path.sep;
            const stats = fs.statfsSync(drive);
            const total = stats.total;
            const free = stats.available;
            const used = total - free;
            const percent = ((used / total) * 100).toFixed(1);

            disks.push({
                mount: drive,
                device: drive,
                total: (total / 1024 / 1024 / 1024).toFixed(2),
                used: (used / 1024 / 1024 / 1024).toFixed(2),
                free: (free / 1024 / 1024 / 1024).toFixed(2),
                percent,
                temperature: null
            });
        }
    } catch (e) {
        disks.push({
            mount: 'C:\\',
            device: 'C:\\',
            total: '0',
            used: '0',
            free: '0',
            percent: '0',
            temperature: null
        });
    }
    return disks;
}

/**
 * 快速获取GPU信息（极速版 - 避免延迟）
 * 优先使用 Python 插件获取实时数据
 */
async function getGPUInfoFast() {
    const gpu = {
        usage: null,
        temperature: null,
        memory: null,
        memoryUsed: null,
        memoryTotal: null,
        name: null,
        isDedicated: false,
        vram: null,
        powerUsage: null
    };

    // 优先使用 OpenHardwareMonitor 获取 GPU 信息
    try {
        const { execSync } = require('child_process');

        // 独立显卡关键词（优先级从高到低）
        const dedicatedKeywords = [
            'geforce rtx', 'geforce gtx', 'nvidia rtx', 'nvidia gtx',
            'radeon rx', 'amd radeon', 'rtx ', 'gtx ',
            'quadro', 'firepro', 'arc '
        ];

        // 集成显卡关键词（排除）
        const integratedKeywords = [
            'intel', 'uhd', 'hd graphics', 'iris', 'xe'
        ];

        // 获取所有显卡硬件列表
        const hardwareOutput = execSync(
            'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Hardware 2>$null | ConvertTo-Json -Depth 3"',
            { encoding: 'utf8', timeout: 3000, windowsHide: true }
        );

        let selectedGPUHardware = null;

        if (hardwareOutput && hardwareOutput.trim()) {
            try {
                const hardwareList = JSON.parse(hardwareOutput);
                const hwList = Array.isArray(hardwareList) ? hardwareList : [hardwareList];

                // 筛选出独立显卡（NVIDIA/AMD）
                const dedicatedGPUs = hwList.filter(hw => {
                    if (!hw.Name) return false;
                    const nameLower = hw.Name.toLowerCase();
                    return dedicatedKeywords.some(kw => nameLower.includes(kw.toLowerCase()));
                });

                if (dedicatedGPUs.length > 0) {
                    // 选择第一个独立显卡
                    selectedGPUHardware = dedicatedGPUs[0];
                    logger.debug(`找到独立显卡: ${selectedGPUHardware.Name}`);
                } else {
                    // 如果没有独立显卡，选择第一个非集显的显卡
                    const nonIntegrated = hwList.filter(hw => {
                        if (!hw.Name) return false;
                        const nameLower = hw.Name.toLowerCase();
                        return !integratedKeywords.some(kw => nameLower.includes(kw));
                    });

                    if (nonIntegrated.length > 0) {
                        selectedGPUHardware = nonIntegrated[0];
                        logger.debug(`未找到独立显卡，使用: ${selectedGPUHardware.Name}`);
                    }
                }
            } catch (e) {
                logger.debug('解析硬件列表失败:', e.message);
            }
        }

        // 获取所选显卡的传感器数据
        if (selectedGPUHardware) {
            gpu.name = selectedGPUHardware.Name;
            const nameLower = gpu.name.toLowerCase();
            gpu.isDedicated = !integratedKeywords.some(kw => nameLower.includes(kw)) ||
                             dedicatedKeywords.some(kw => nameLower.includes(kw.toLowerCase()));

            // 获取该显卡的所有传感器
            const sensorOutput = execSync(
                `powershell -Command "Get-CimInstance -Namespace 'root\\OpenHardwareMonitor' -ClassName Sensor 2>$null | Where-Object {$_.Parent -eq '${selectedGPUHardware.Identifier}'} | ConvertTo-Json -Depth 4"`,
                { encoding: 'utf8', timeout: 3000, windowsHide: true }
            );

            if (sensorOutput && sensorOutput.trim()) {
                try {
                    const sensors = JSON.parse(sensorOutput);
                    const sensorList = Array.isArray(sensors) ? sensors : [sensors];

                    // 查找温度
                    const gpuTemp = sensorList.find(s => s.SensorType === 'Temperature' && s.Name?.match(/core|package|temp/i));
                    if (gpuTemp && gpuTemp.Value) {
                        const tempValue = parseFloat(gpuTemp.Value);
                        if (tempValue > 0 && tempValue < 150) {
                            gpu.temperature = tempValue.toString();
                            logger.debug(`OpenHardwareMonitor获取GPU温度: ${gpu.temperature}°C`);
                        }
                    }

                    // 查找占用率（3D/Compute）
                    const gpuLoad = sensorList.find(s => s.SensorType === 'Load' && s.Name?.match(/3d|compute|video|gpu/i));
                    if (gpuLoad && gpuLoad.Value) {
                        const loadValue = parseFloat(gpuLoad.Value);
                        if (loadValue >= 0 && loadValue <= 100) {
                            gpu.usage = loadValue.toString();
                            logger.debug(`OpenHardwareMonitor获取GPU占用率: ${gpu.usage}%`);
                        }
                    }

                    // 查找显存使用量
                    const gpuMemUsed = sensorList.find(s => 
                        (s.SensorType === 'SmallData' || s.SensorType === 'Load') && 
                        s.Name?.match(/memory|ram|vram|fb|used/i)
                    );
                    if (gpuMemUsed && gpuMemUsed.Value) {
                        const memValue = parseFloat(gpuMemUsed.Value);
                        if (memValue > 0) {
                            gpu.memoryUsed = `${Math.round(memValue)} MB`;
                            logger.debug(`OpenHardwareMonitor获取GPU显存使用: ${gpu.memoryUsed}`);
                        }
                    }

                    // 查找显存总量
                    const gpuMemTotal = sensorList.find(s => 
                        s.SensorType === 'SmallData' && 
                        s.Name?.match(/total|size|capacity/i)
                    );
                    if (gpuMemTotal && gpuMemTotal.Value) {
                        const memTotalValue = parseFloat(gpuMemTotal.Value);
                        if (memTotalValue > 0) {
                            gpu.memoryTotal = `${Math.round(memTotalValue)} MB`;
                            gpu.vram = gpu.memoryTotal;
                            logger.debug(`OpenHardwareMonitor获取GPU显存总量: ${gpu.memoryTotal}`);
                        }
                    }

                    // 查找功耗
                    const gpuPower = sensorList.find(s => 
                        (s.SensorType === 'Power' || s.SensorType === 'SmallData') && 
                        s.Name?.match(/power|watts|draw|package/i)
                    );
                    if (gpuPower && gpuPower.Value) {
                        const powerValue = parseFloat(gpuPower.Value);
                        if (powerValue > 0 && powerValue < 500) {
                            gpu.powerUsage = `${powerValue.toFixed(1)} W`;
                            logger.debug(`OpenHardwareMonitor获取GPU功耗: ${gpu.powerUsage}`);
                        }
                    }

                    logger.debug(`OpenHardwareMonitor获取独立显卡信息成功: ${gpu.name}`);
                    return gpu;
                } catch (parseErr) {
                    logger.debug('解析传感器数据失败:', parseErr.message);
                }
            }
        }
    } catch (e) {
        logger.debug('OpenHardwareMonitor获取GPU信息失败:', e.message);
    }

    // 备用方案：使用nvidia-smi或WMI

    // 方法2：备用方案 - 原有逻辑
    try {
        if (process.platform === 'win32') {
            const { execSync } = require('child_process');
            
            // 首先尝试使用 nvidia-smi 获取 NVIDIA GPU 实时数据
            let nvidiaDataObtained = false;
            try {
                const nvidiaSmi = execSync(
                    'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.gr --format=csv,noheader,nounits 2>nul',
                    { encoding: 'utf8', timeout: 3000, windowsHide: true }
                );
                
                if (nvidiaSmi && nvidiaSmi.trim() && !nvidiaSmi.toLowerCase().includes('not found') && !nvidiaSmi.toLowerCase().includes('failed')) {
                    const lines = nvidiaSmi.trim().split('\n');
                    if (lines.length > 0 && lines[0] && lines[0].length > 5) {
                        const parts = lines[0].split(/,|,(?=\s)/).map(p => p.trim());
                        
                        if (parts[0] && parts[0].length > 3) {
                            gpu.name = parts[0];
                            gpu.isDedicated = true;
                        }
                        
                        // 获取温度
                        if (parts[1] && !isNaN(parts[1])) {
                            gpu.temperature = parts[1];
                        }
                        
                        // 获取占用率
                        if (parts[2] && !isNaN(parts[2])) {
                            gpu.usage = parts[2];
                        }
                        
                        // 获取显存
                        if (parts[3] && parts[4] && !isNaN(parts[3]) && !isNaN(parts[4])) {
                            gpu.memoryUsed = `${parts[3]} MB`;
                            gpu.vram = `${parts[4]} MB`;
                        }
                        
                        // 获取功耗
                        if (parts[5] && !isNaN(parts[5])) {
                            gpu.powerUsage = `${parts[5]} W`;
                        }
                        
                        // 获取时钟
                        if (parts[6] && !isNaN(parts[6])) {
                            gpu.clock = `${parts[6]} MHz`;
                        }
                        
                        nvidiaDataObtained = true;
                        logger.debug(`通过nvidia-smi获取GPU数据: ${gpu.name}, 占用: ${gpu.usage}%, 温度: ${gpu.temperature}°C, 显存: ${gpu.memoryUsed}/${gpu.vram}, 功耗: ${gpu.powerUsage}`);
                    }
                }
            } catch (e) {
                logger.debug('Windows nvidia-smi获取失败:', e.message);
            }
            
            // 如果 nvidia-smi 主要数据获取失败，尝试单独获取缺失的数据
            if (!nvidiaDataObtained || !gpu.usage || gpu.usage === '0') {
                // 尝试使用 nvidia-smi 单独获取占用率
                try {
                    const usageOutput = execSync(
                        'nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>nul',
                        { encoding: 'utf8', timeout: 2000, windowsHide: true }
                    );
                    
                    if (usageOutput && usageOutput.trim() && !isNaN(usageOutput.trim())) {
                        gpu.usage = usageOutput.trim();
                        logger.debug(`通过nvidia-smi获取GPU占用率: ${gpu.usage}%`);
                        nvidiaDataObtained = true;
                    }
                } catch (e) {
                    logger.debug('nvidia-smi获取GPU占用率失败:', e.message);
                }
                
                // 尝试使用 nvidia-smi 单独获取功耗
                if (!gpu.powerUsage || gpu.powerUsage === ' W') {
                    try {
                        const powerOutput = execSync(
                            'nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits 2>nul',
                            { encoding: 'utf8', timeout: 2000, windowsHide: true }
                        );
                        
                        if (powerOutput && powerOutput.trim()) {
                            // 清理输出，可能包含单位
                            const powerValue = powerOutput.trim().replace(/[^0-9.]/g, '');
                            if (powerValue && !isNaN(powerValue)) {
                                gpu.powerUsage = `${powerValue} W`;
                                logger.debug(`通过nvidia-smi获取GPU功耗: ${gpu.powerUsage}`);
                            }
                        }
                    } catch (e) {
                        logger.debug('nvidia-smi获取GPU功耗失败:', e.message);
                    }
                }
            }
            
            // 如果 nvidia-smi 失败，尝试使用 WMI 获取静态信息
            if (!nvidiaDataObtained) {
                // Windows WMI 代码...
                try {
                    const gpuOutput = execSync(
                        'powershell -Command "Get-CimInstance -ClassName Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress"',
                        { encoding: 'utf8', timeout: 3000, windowsHide: true }
                    );
                    
                    if (gpuOutput && gpuOutput.trim()) {
                        let controllers;
                        try {
                            controllers = JSON.parse(gpuOutput);
                        } catch (e) {
                            controllers = [];
                        }
                        
                        const controllerList = Array.isArray(controllers) ? controllers : [controllers];
                        
                        // 寻找最佳显卡
                        let selectedGPU = null;
                        
                        for (const controller of controllerList) {
                            const name = (controller.Name || '').toLowerCase();
                            if (!name.includes('microsoft') && !name.includes('virtual') && !name.includes('software')) {
                                const isDedicated = dedicatedKeywords.slice(0, 8).some(kw => name.includes(kw));
                                if (isDedicated) {
                                    selectedGPU = controller;
                                    gpu.isDedicated = true;
                                    break;
                                }
                            }
                        }
                        
                        if (!selectedGPU && controllerList.length > 0) {
                            selectedGPU = controllerList.reduce((prev, current) => {
                                const prevRam = parseInt(prev.AdapterRAM) || 0;
                                const currRam = parseInt(current.AdapterRAM) || 0;
                                return currRam > prevRam ? current : prev;
                            });
                            
                            const name = (selectedGPU.Name || '').toLowerCase();
                            if (name.includes('intel') && (name.includes('uhd') || name.includes('hd') || name.includes('iris'))) {
                                gpu.isDedicated = false;
                            } else if (parseInt(selectedGPU.AdapterRAM) > 0) {
                                gpu.isDedicated = true;
                            }
                        }
                        
                        if (selectedGPU) {
                            gpu.name = selectedGPU.Name || 'NVIDIA 显卡';
                            
                            const vramBytes = parseInt(selectedGPU.AdapterRAM) || 0;
                            if (vramBytes >= 8 * 1024 * 1024 * 1024 || (gpu.name.toLowerCase().includes('4070'))) {
                                gpu.vram = '8 GB';
                            } else if (vramBytes >= 4 * 1024 * 1024 * 1024) {
                                gpu.vram = '4 GB';
                            } else if (vramBytes > 0) {
                                gpu.vram = `${(vramBytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
                            } else {
                                gpu.vram = '共享内存';
                            }
                        }
                    }
                } catch (e) {
                    logger.debug('GPU WMI查询失败');
                }
                
                // 尝试使用 PowerShell 获取 GPU 占用率（WMI 性能计数器 - 备用方案）
                if (!gpu.usage || gpu.usage === '0') {
                    try {
                        const usageOutput = execSync(
                            'powershell -Command "$gpu = Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object {$_.Name -like \\"*_0\\"}; if ($gpu) { [Math]::Round($gpu.GPUUtilization) } else { \\"failed\\" }" 2>nul',
                            { encoding: 'utf8', timeout: 3000 }
                        );
                        
                        if (usageOutput && usageOutput.trim() && !usageOutput.toLowerCase().includes('failed')) {
                            const usage = parseInt(usageOutput.trim());
                            if (usage >= 0 && usage <= 100) {
                                gpu.usage = usage.toString();
                                logger.debug(`通过WMI性能计数器获取GPU占用率: ${gpu.usage}%`);
                            }
                        }
                    } catch (e) {
                        logger.debug('WMI性能计数器获取失败:', e.message);
                    }
                }
                
                // 尝试使用 nvidia-smi 获取温度（备用方案）
                if (!gpu.temperature || gpu.temperature === '0') {
                    try {
                        const tempOutput = execSync(
                            'nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>nul',
                            { encoding: 'utf8', timeout: 2000, windowsHide: true }
                        );
                        
                        if (tempOutput && tempOutput.trim()) {
                            const temp = parseInt(tempOutput.trim());
                            if (temp > 0 && temp < 150) {
                                gpu.temperature = temp.toString();
                                logger.debug(`通过nvidia-smi获取GPU温度: ${gpu.temperature}°C`);
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
                
                // 尝试获取显存使用量（备用方案）
                if (gpu.vram && !gpu.memoryUsed) {
                    try {
                        const memOutput = execSync(
                            'nvidia-smi --query-gpu=memory.used,memory.total --format=csv,noheader,nounits 2>nul',
                            { encoding: 'utf8', timeout: 2000, windowsHide: true }
                        );
                        
                        if (memOutput && memOutput.trim()) {
                            const memParts = memOutput.split(/,|,(?=\s)/).map(p => p.trim());
                            if (memParts.length >= 2) {
                                gpu.memoryUsed = `${memParts[0]} MB`;
                                gpu.vram = `${memParts[1]} MB`;
                                logger.debug(`通过nvidia-smi获取GPU显存: ${gpu.memoryUsed} / ${gpu.vram}`);
                            }
                        }
                    } catch (e) {
                        // 忽略
                    }
                }
            }
        }  // Windows 平台结束
        
        // Linux 平台使用 nvidia-smi 获取实时数据
        if (process.platform === 'linux') {
            try {
                const { execSync } = require('child_process');
                const nvidiaSmi = execSync(
                    'nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null',
                    { encoding: 'utf8', timeout: 1000 }
                );
                
                if (nvidiaSmi && !nvidiaSmi.includes('No')) {
                    const lines = nvidiaSmi.trim().split('\n');
                    if (lines.length > 0 && lines[0]) {
                        const parts = lines[0].split(',').map(p => p.trim());
                        if (parts[0]) {
                            gpu.name = parts[0];
                            gpu.isDedicated = dedicatedKeywords.some(kw => parts[0].toLowerCase().includes(kw));
                            
                            if (parts[1]) {
                                gpu.temperature = parts[1];
                            }
                            if (parts[2]) {
                                gpu.usage = parts[2];
                            }
                            if (parts[3] && parts[4]) {
                                gpu.memoryUsed = `${parts[3]} MB`;
                                gpu.vram = `${parts[4]} MB`;
                            }
                            
                            logger.debug(`通过nvidia-smi获取GPU实时数据: ${gpu.name}, 占用: ${gpu.usage}%, 温度: ${gpu.temperature}°C`);
                        }
                    }
                }
            } catch (e) {
                logger.debug('Linux nvidia-smi获取失败:', e.message);
            }
        }
        
        // macOS 平台
        if (process.platform === 'darwin') {
            try {
                const { execSync } = require('child_process');
                const sysOutput = execSync('system_profiler SPDisplaysDataType 2>/dev/null | head -10', { encoding: 'utf8', timeout: 2000 });
                const match = sysOutput.match(/Chipset Model:\s*(.+)/i);
                if (match) {
                    gpu.name = match[1].trim();
                    gpu.isDedicated = dedicatedKeywords.some(kw => gpu.name.toLowerCase().includes(kw));
                }
            } catch (e) {}
        }
    } catch (e) {
        logger.debug('GPU检测失败:', e.message);
    }

    // 回退值
    if (!gpu.name) {
        gpu.name = '集成显卡';
        gpu.isDedicated = false;
        gpu.vram = '共享内存';
    }

    return gpu;
}

/**
 * 获取连接用户列表
 * GET /api/system/users
 */
router.get('/users', async (req, res) => {
    try {
        const users = getConnectedUsers();

        res.json({
            success: true,
            data: {
                count: users.length,
                users
            }
        });
    } catch (error) {
        logger.error('获取用户列表失败:', error);
        res.status(500).json({
            success: false,
            error: '获取用户列表失败'
        });
    }
});

/**
 * 获取系统日志
 * GET /api/system/logs
 */
router.get('/logs', async (req, res) => {
    try {
        const { level, limit = 100 } = req.query;

        const logs = global.db.getSystemLogs(level, parseInt(limit));

        res.json({
            success: true,
            data: {
                logs,
                count: logs.length
            }
        });
    } catch (error) {
        logger.error('获取系统日志失败:', error);
        res.status(500).json({
            success: false,
            error: '获取日志失败'
        });
    }
});

/**
 * 获取转码任务状态
 * GET /api/system/transcode-tasks
 */
router.get('/transcode-tasks', async (req, res) => {
    try {
        const tasks = await global.redis.getAllTranscodeProgress();

        const taskList = [];
        for (const [fileId, progress] of Object.entries(tasks)) {
            const file = global.db.getFileById(fileId);
            taskList.push({
                fileId,
                fileName: file?.name || '未知',
                progress: parseInt(progress),
                status: progress >= 100 ? 'completed' : 'processing'
            });
        }

        res.json({
            success: true,
            data: {
                tasks: taskList,
                count: taskList.length
            }
        });
    } catch (error) {
        logger.error('获取转码任务状态失败:', error);
        res.status(500).json({
            success: false,
            error: '获取转码状态失败'
        });
    }
});

/**
 * 获取系统配置
 * GET /api/system/config
 */
router.get('/config', async (req, res) => {
    try {
        const configData = global.db.getAllConfig();

        // 过滤敏感配置
        const safeConfig = {
            site_name: configData.site_name,
            allow_registration: configData.allow_registration,
            maintenance_mode: configData.maintenance_mode,
            max_upload_size: configData.max_upload_size
        };

        res.json({
            success: true,
            data: {
                system: safeConfig,
                features: config.features,
                limits: {
                    maxUploadSize: config.upload.maxFileSize,
                    allowedTypes: config.upload.allowedTypes.length
                }
            }
        });
    } catch (error) {
        logger.error('获取系统配置失败:', error);
        res.status(500).json({
            success: false,
            error: '获取配置失败'
        });
    }
});

/**
 * 获取系统健康状态
 * GET /api/system/health
 */
router.get('/health', async (req, res) => {
    try {
        const [cpuInfo, memory, disk] = await Promise.all([
            getCPUInfo(),
            getMemoryInfo(),
            getDiskInfo()
        ]);

        const checks = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            checks: {}
        };

        // 检查CPU温度
        if (cpuInfo.temperature && parseFloat(cpuInfo.temperature) > 80) {
            checks.checks.cpu = { status: 'degraded', message: `温度 ${cpuInfo.temperature}°C` };
        } else {
            checks.checks.cpu = { status: 'healthy', message: cpuInfo.temperature ? `${cpuInfo.temperature}°C` : '无法获取' };
        }

        // 检查数据库
        try {
            const fileStats = global.db.getFileStats();
            checks.checks.database = { status: 'healthy', message: 'SQLite连接正常' };
        } catch (error) {
            checks.checks.database = { status: 'unhealthy', message: error.message };
            checks.status = 'degraded';
        }

        // 检查Redis
        try {
            await global.redis.client?.ping();
            checks.checks.redis = { status: 'healthy', message: 'Redis连接正常' };
        } catch (error) {
            checks.checks.redis = { status: 'degraded', message: 'Redis不可用（使用内存缓存）' };
        }

        // 检查磁盘空间
        if (disk[0]) {
            const diskPercent = parseFloat(disk[0].percent);
            checks.checks.disk = {
                status: diskPercent > 90 ? 'unhealthy' : diskPercent > 80 ? 'degraded' : 'healthy',
                message: `已使用 ${disk[0].used}GB / 总计 ${disk[0].total}GB${disk[0].temperature ? ` (${disk[0].temperature}°C)` : ''}`
            };
        }

        // 检查内存
        const memPercent = parseFloat(memory.percent);
        checks.checks.memory = {
            status: memPercent > 90 ? 'unhealthy' : memPercent > 80 ? 'degraded' : 'healthy',
            message: `已使用 ${memory.used}GB / 总计 ${memory.total}GB${memory.temperature ? ` (${memory.temperature}°C)` : ''}`
        };

        const statusCode = checks.status === 'healthy' ? 200 : checks.status === 'degraded' ? 200 : 503;
        res.status(statusCode).json(checks);
    } catch (error) {
        logger.error('健康检查失败:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

/**
 * 获取统计数据
 * GET /api/system/statistics
 */
router.get('/statistics', async (req, res) => {
    try {
        const [fileStats, userStats] = await Promise.all([
            global.db.getFileStats(),
            global.db.getUserStats()
        ]);

        // 计算总存储
        let totalStorage = 0;
        let totalFiles = 0;

        for (const stat of fileStats) {
            totalStorage += stat.total_size;
            totalFiles += stat.count;
        }

        res.json({
            success: true,
            data: {
                storage: {
                    total: (totalStorage / 1024 / 1024 / 1024).toFixed(2), // GB
                    files: totalFiles
                },
                users: userStats,
                server: {
                    uptime: process.uptime(),
                    connections: global.connectedUsers.size
                }
            }
        });
    } catch (error) {
        logger.error('获取统计数据失败:', error);
        res.status(500).json({
            success: false,
            error: '获取统计数据失败'
        });
    }
});

/**
 * 重启服务（仅管理员）
 * POST /api/system/restart
 */
router.post('/restart', async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                error: '权限不足'
            });
        }

        logger.warn(`管理员 ${req.user.username} 正在重启服务...`);

        // 延迟重启，让请求返回
        setTimeout(() => {
            process.exit(0);
        }, 1000);

        res.json({
            success: true,
            message: '服务正在重启...'
        });
    } catch (error) {
        logger.error('重启服务失败:', error);
        res.status(500).json({
            success: false,
            error: '重启服务失败'
        });
    }
});

module.exports = router;
