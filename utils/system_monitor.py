#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
系统监控脚本 - 专门优化支持AMD处理器温度读取
使用多种方法确保在AMD平台上获取准确的CPU温度
"""

import sys
import json
import time
import os
import platform
import subprocess
import re

try:
    import psutil
except ImportError:
    psutil = None

def run_command(cmd, timeout=10):
    """安全运行命令"""
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=True
        )
        return result.stdout, result.stderr, result.returncode
    except Exception as e:
        return "", str(e), -1

def get_cpu_info():
    """获取 CPU 实时信息 - 专门优化AMD处理器支持"""
    try:
        if not psutil:
            return {'success': False, 'error': 'psutil not installed'}
        
        # CPU 使用率 - 非阻塞方式，多次采样取平均
        cpu_percent = 0.0
        for _ in range(3):
            cpu_percent += psutil.cpu_percent(interval=None)
        cpu_percent = cpu_percent / 3
        
        # CPU 逻辑核心数
        cpu_count = psutil.cpu_count(logical=True)
        
        # CPU 物理核心数
        physical_cores = psutil.cpu_count(logical=False)
        
        # CPU 频率（如果可用）
        cpu_freq = None
        try:
            freq = psutil.cpu_freq()
            if freq:
                cpu_freq = {
                    'current': round(freq.current),
                    'min': round(freq.min),
                    'max': round(freq.max)
                }
        except Exception:
            pass
        
        # CPU 时间统计 - 非阻塞方式
        cpu_times = psutil.cpu_times_percent(interval=None)
        times_data = {
            'user': cpu_times.user,
            'system': cpu_times.system,
            'idle': cpu_times.idle,
            'interrupt': getattr(cpu_times, 'interrupt', 0),
            'dpc': getattr(cpu_times, 'dpc', 0)
        }
        
        # 获取 CPU 温度 - 专门优化 AMD 处理器
        temperature = get_cpu_temperature_amd_optimized()
        
        # 获取 CPU 功耗 (真实读取，不使用估算)
        power_usage = get_cpu_power()
        
        # 获取 CPU 型号
        cpu_model = get_cpu_model()
        
        return {
            'success': True,
            'cpu': {
                'usage': round(cpu_percent, 1),
                'cores': cpu_count,
                'physical_cores': physical_cores,
                'model': cpu_model,
                'temperature': temperature,
                'power_usage': power_usage,
                'frequency': cpu_freq,
                'times': times_data
            },
            'timestamp': time.time()
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_cpu_temperature_amd_optimized():
    """获取 CPU 温度 - 专门优化支持 AMD 处理器"""
    temperature = None
    system = platform.system()
    
    print(f"[DEBUG] 正在获取CPU温度，系统: {system}", file=sys.stderr)
    
    try:
        if system == 'Linux':
            # Linux 平台温度获取
            temp_paths = [
                '/sys/class/thermal/thermal_zone0/temp',
                '/sys/class/thermal/thermal_zone1/temp',
                '/sys/class/hwmon/hwmon0/temp1_input',
                '/sys/class/hwmon/hwmon1/temp1_input',
                '/sys/devices/platform/coretemp.0/hwmon/hwmon*/temp1_input'
            ]
            for path in temp_paths:
                try:
                    if os.path.exists(path):
                        with open(path, 'r') as f:
                            temp_raw = int(f.read().strip())
                            temp = temp_raw / 1000
                            if 0 < temp < 150:
                                temperature = round(temp)
                                print(f"[DEBUG] 通过sysfs获取到CPU温度: {temperature}°C", file=sys.stderr)
                                return temperature
                except:
                    pass
            
            # 使用 sensors 命令
            try:
                result = subprocess.run(
                    ['sensors', '2>/dev/null'],
                    capture_output=True, text=True, timeout=2
                )
                if result.returncode == 0:
                    # 查找 Core 0 或 Tdie 温度
                    patterns = [
                        r'Core 0.*?\+([0-9.]+)°C',
                        r'Tdie.*?\+([0-9.]+)°C',
                        r'Tctl.*?\+([0-9.]+)°C',
                        r'Package.*?\+([0-9.]+)°C'
                    ]
                    for pattern in patterns:
                        match = re.search(pattern, result.stdout)
                        if match:
                            temperature = round(float(match.group(1)))
                            print(f"[DEBUG] 通过sensors获取到CPU温度: {temperature}°C", file=sys.stderr)
                            return temperature
            except:
                pass
                
        elif system == 'Windows':
            # ====== Windows 平台 - 专门优化 AMD 处理器 ======
            
            # 方法1: 尝试 OpenHardwareMonitor (如果已安装)
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq \'Temperature\' -and ($_.Name -match \'CPU|CPU Package|Tdie|Tctl\' -or $_.Parent -match \'CPU\')} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                timeout=5
            )
            
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        value = data.get('Value') or data.get('value')
                        if value and isinstance(value, (int, float)) and 0 < value < 200:
                            temperature = float(value)
                            print(f"[DEBUG] OpenHardwareMonitor获取到CPU温度: {temperature}°C", file=sys.stderr)
                            return temperature
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法2: 尝试 HWiNFO64 (如果已安装)
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -Namespace \'root\\HWiNFO64\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq 0 -and $_.Name -match \'CPU|Tdie|Tctl\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                timeout=5
            )
            
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        value = data.get('Value') or data.get('value')
                        if value and isinstance(value, (int, float)) and 0 < value < 200:
                            temperature = float(value)
                            print(f"[DEBUG] HWiNFO64获取到CPU温度: {temperature}°C", file=sys.stderr)
                            return temperature
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法3: 尝试 AMD特有温度接口
            stdout, stderr, rc = run_command(
                'powershell -Command "$temp = Get-CimInstance -Namespace \'root\\wmi\' -ClassName \'AMD_BoardTemp\' -ErrorAction SilentlyContinue; if ($temp) { $temp.CurrentTemp } else { \'\' }" 2>nul',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    value = float(stdout.strip())
                    if 0 < value < 200:
                        temperature = value
                        print(f"[DEBUG] AMD_BoardTemp获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
                except ValueError:
                    pass
            
            # 方法4: 使用 AMD ADL (如果安装了AMD驱动)
            stdout, stderr, rc = run_command(
                'powershell -Command "$adl = New-Object -ComObject ADL2; if ($adl) { $overdrive = $adl.GetOverdriveInfo(0); if ($overdrive) { $temp = $adl.GetThermalLimit(0); if ($temp) { $temp } } }" 2>nul',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    value = float(stdout.strip())
                    if 0 < value < 200:
                        temperature = value
                        print(f"[DEBUG] ADL获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
                except ValueError:
                    pass
            
            # 方法5: WMI ThermalZone (标准方法)
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -ClassName MSAcpi_ThermalZoneTemperature -Namespace \'root/wmi\' 2>$null | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                timeout=5
            )
            
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict) and 'CurrentTemperature' in data:
                        temp_kelvin = float(data['CurrentTemperature'])
                        temperature = round((temp_kelvin - 2732) / 10, 1)
                        print(f"[DEBUG] WMI ThermalZone获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法6: wmic 命令备选
            stdout, stderr, rc = run_command(
                'wmic /namespace:\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature /value 2>nul',
                timeout=5
            )
            if rc == 0:
                for line in stdout.strip().split('\n'):
                    if '=' in line:
                        try:
                            temp_kelvin = float(line.split('=')[1].strip())
                            temperature = round((temp_kelvin - 2732) / 10, 1)
                            print(f"[DEBUG] wmic获取到CPU温度: {temperature}°C", file=sys.stderr)
                            return temperature
                        except:
                            continue
            
            # 方法7: Win32_TemperatureProbe
            stdout, stderr, rc = run_command(
                'powershell -Command "$probe = Get-CimInstance -ClassName Win32_TemperatureProbe -ErrorAction SilentlyContinue | Select-Object -First 1; if ($probe -and $probe.CurrentReading) { [Math]::Round($probe.CurrentReading / 10, 1) }" 2>nul',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    value = float(stdout.strip())
                    if 0 < value < 200:
                        temperature = value
                        print(f"[DEBUG] Win32_TemperatureProbe获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
                except ValueError:
                    pass
            
            # 方法8: 尝试读取 SAPI (某些系统支持)
            stdout, stderr, rc = run_command(
                'powershell -Command "$sapi = Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation -ErrorAction SilentlyContinue | Select-Object -First 1; if ($sapi) { $sapi.Temperature }" 2>nul',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    value = float(stdout.strip())
                    if 0 < value < 200:
                        temperature = value
                        print(f"[DEBUG] ThermalZoneInformation获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
                except ValueError:
                    pass
                
        elif system == 'Darwin':
            # macOS: 使用 powermetrics 或 istats
            try:
                result = subprocess.run(
                    ['sudo', 'powermetrics', '--samplers', 'smc', '-n', '1'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    match = re.search(r'CPU die temperature: (\d+)', result.stdout)
                    if match:
                        temperature = int(match.group(1))
                        print(f"[DEBUG] powermetrics获取到CPU温度: {temperature}°C", file=sys.stderr)
                        return temperature
            except:
                pass
            
            # 备选: 使用 istats
            if not temperature:
                try:
                    result = subprocess.run(['istats', 'cpu'], capture_output=True, text=True, timeout=2)
                    if result.returncode == 0:
                        match = re.search(r'CPU temperature:\s+([0-9.]+)', result.stdout)
                        if match:
                            temperature = round(float(match.group(1)))
                            print(f"[DEBUG] istats获取到CPU温度: {temperature}°C", file=sys.stderr)
                            return temperature
                except:
                    pass
                    
    except Exception as e:
        print(f"[DEBUG] 获取CPU温度异常: {str(e)}", file=sys.stderr)
        pass
    
    print(f"[DEBUG] 无法获取CPU温度，返回null", file=sys.stderr)
    return temperature


def get_cpu_model():
    """获取 CPU 型号"""
    try:
        system = platform.system()
        
        if system == 'Linux':
            # 尝试从 /proc/cpuinfo 读取
            try:
                with open('/proc/cpuinfo', 'r') as f:
                    for line in f:
                        if line.startswith('model name') or line.startswith('Model'):
                            return line.split(':', 1)[1].strip()
            except:
                pass
            
            # 尝试使用 lscpu
            try:
                result = subprocess.run(['lscpu'], capture_output=True, text=True, timeout=2)
                for line in result.stdout.split('\n'):
                    if 'Model name' in line or 'CPU model' in line:
                        return line.split(':', 1)[1].strip()
            except:
                pass
                
        elif system == 'Windows':
            try:
                result = subprocess.run([
                    'wmic', 'CPU', 'get', 'Name', '/VALUE'
                ], capture_output=True, text=True, timeout=3)
                
                if result.returncode == 0:
                    for line in result.stdout.split('\n'):
                        if line.startswith('Name='):
                            return line.split('=', 1)[1].strip().replace('\r', '')
            except:
                pass
                
        elif system == 'Darwin':
            try:
                result = subprocess.run(
                    ['sysctl', '-n', 'machdep.cpu.brand_string'], 
                    capture_output=True, text=True, timeout=2
                )
                if result.returncode == 0:
                    return result.stdout.strip()
            except:
                pass
        
        # 备用：使用 platform 模块
        return platform.processor() or platform.machine()
        
    except Exception:
        return platform.processor()


def get_cpu_power():
    """获取 CPU 真实功耗（尝试多种方法读取实时数据）
    
    返回:
        - 成功: 返回功耗值 (W)
        - 失败: 返回 None (不支持读取)
    
    注意: 不使用估算值，要求真实读取
    """
    system = platform.system()
    power = None
    
    try:
        if system == 'Linux':
            # 方法1: 使用 RAPL 读取 Package 功耗 (最准确)
            rapl_paths = [
                '/sys/class/powercap/intel-rapl:0/energy_uj',
                '/sys/class/powercap/intel-rapl:1/energy_uj',
                '/sys/class/powercap/intel-rapl:0:0/energy_uj',
                '/sys/class/powercap/intel-rapl:0:1/energy_uj'
            ]
            
            # RAPL需要采样两次计算差值
            for rapl_path in rapl_paths:
                if os.path.exists(rapl_path):
                    try:
                        with open(rapl_path, 'r') as f:
                            energy1 = int(f.read().strip())
                        time.sleep(0.1)  # 等待100ms
                        with open(rapl_path, 'r') as f:
                            energy2 = int(f.read().strip())
                        
                        # 计算功耗 (能量差 / 时间差)
                        energy_diff = energy2 - energy1  # 微焦耳
                        power_watts = energy_diff / 100000  # 转换为瓦 (0.1秒)
                        
                        if 0 < power_watts < 500:  # 合理范围
                            power = round(power_watts, 1)
                            print(f"[DEBUG] RAPL读取CPU功耗: {power}W", file=sys.stderr)
                            return power
                    except Exception:
                        continue
            
            # 方法2: 使用 sensors 读取
            stdout, stderr, rc = run_command('sensors 2>/dev/null | grep -i "power" | head -5', timeout=3)
            if rc == 0:
                # 查找功率值
                power_matches = re.findall(r'power\d*:\s*([\d.]+)\s*W', stdout)
                if power_matches:
                    power = round(float(power_matches[0]), 1)
                    print(f"[DEBUG] sensors读取CPU功耗: {power}W", file=sys.stderr)
                    return power
            
            # 方法3: 使用 powertop (如果可用)
            stdout, stderr, rc = run_command('powertop 2>/dev/null | grep -i "power" | head -3', timeout=5)
            if rc == 0:
                power_matches = re.findall(r'([\d.]+)\s*W', stdout)
                if power_matches:
                    power = round(float(power_matches[0]), 1)
                    print(f"[DEBUG] powertop读取CPU功耗: {power}W", file=sys.stderr)
                    return power
                    
        elif system == 'Windows':
            # 方法1: 使用 OpenHardwareMonitor WMI
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq \'Power\' -and ($_.Name -match \'CPU|CPU Package|CPU Total\' -or $_.Parent -match \'CPU\')} | Select-Object -First 1 Value | ConvertTo-Json"',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        value = data.get('Value') or data.get('value')
                        if value and isinstance(value, (int, float)) and 0 < value < 500:
                            power = round(float(value), 1)
                            print(f"[DEBUG] OpenHardwareMonitor读取CPU功耗: {power}W", file=sys.stderr)
                            return power
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法2: 使用 HWiNFO64 WMI
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -Namespace \'root\\HWiNFO64\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq 3 -and $_.Name -match \'CPU|Total\'} | Select-Object -First 1 Value | ConvertTo-Json"',
                timeout=5
            )
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        value = data.get('Value') or data.get('value')
                        if value and isinstance(value, (int, float)) and 0 < value < 500:
                            power = round(float(value), 1)
                            print(f"[DEBUG] HWiNFO64读取CPU功耗: {power}W", file=sys.stderr)
                            return power
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法3: 使用 WMI Processor 信息
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -ClassName Win32_PerfFormattedData_Counters_ProcessorInformation -ErrorAction SilentlyContinue | Where-Object {$_.Name -eq \'_Total\'} | Select-Object -First 1 | ConvertTo-Json"',
                timeout=3
            )
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        # WMI没有直接的CPU功耗，这是功率状态
                        power = data.get('PercentMaxFrequency')  # 这不是功耗
                except:
                    pass
            
            # 方法4: 尝试使用 AMD AdlHelper (如果可用)
            stdout, stderr, rc = run_command(
                'powershell -Command "$a = Get-CimInstance -Namespace \'root\\WMI\' -ClassName \'AMD_Power\' -ErrorAction SilentlyContinue; if ($a) { $a.Power } else { \'\' }" 2>nul',
                timeout=3
            )
            if rc == 0 and stdout.strip():
                try:
                    power = round(float(stdout.strip()), 1)
                    print(f"[DEBUG] AMD ADL读取CPU功耗: {power}W", file=sys.stderr)
                    return power
                except:
                    pass
                    
        elif system == 'Darwin':
            # macOS: 使用 powermetrics
            stdout, stderr, rc = run_command(
                'sudo powermetrics --samplers smc -n 1 2>/dev/null | grep -i "CPU Power" | head -2',
                timeout=10
            )
            if rc == 0:
                power_matches = re.findall(r'([\d.]+)\s*W', stdout)
                if power_matches:
                    power = round(float(power_matches[0]), 1)
                    print(f"[DEBUG] powermetrics读取CPU功耗: {power}W", file=sys.stderr)
                    return power
            
            # 备选: 使用 istats
            stdout, stderr, rc = run_command('istats cpu 2>/dev/null | grep -i "power"', timeout=3)
            if rc == 0:
                power_matches = re.findall(r'([\d.]+)\s*W', stdout)
                if power_matches:
                    power = round(float(power_matches[0]), 1)
                    print(f"[DEBUG] istats读取CPU功耗: {power}W", file=sys.stderr)
                    return power
        
        # 所有方法都失败，返回 None（不支持读取）
        print(f"[DEBUG] CPU功耗读取: 不支持此硬件", file=sys.stderr)
        return None
        
    except Exception as e:
        print(f"[DEBUG] CPU功耗读取失败: {e}", file=sys.stderr)
        return None


def estimate_cpu_power(usage_percent):
    """估算 CPU 功耗（仅作为参考，不再使用）
    
    注意: 此函数已弃用，真实功耗无法通过使用率准确估算。
    保留此函数仅用于调试参考。
    """
    return None


def get_memory_info():
    """获取内存实时信息"""
    try:
        if not psutil:
            return {'success': False, 'error': 'psutil not installed'}
        
        # 虚拟内存
        virtual_mem = psutil.virtual_memory()
        
        # 交换内存
        swap_mem = psutil.swap_memory()
        
        return {
            'success': True,
            'memory': {
                'total': round(virtual_mem.total / (1024 ** 3), 2),  # GB
                'used': round(virtual_mem.used / (1024 ** 3), 2),
                'available': round(virtual_mem.available / (1024 ** 3), 2),
                'percent': virtual_mem.percent,
                'swap_total': round(swap_mem.total / (1024 ** 3), 2),
                'swap_used': round(swap_mem.used / (1024 ** 3), 2)
            },
            'timestamp': time.time()
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_disk_info():
    """获取磁盘实时信息"""
    try:
        if not psutil:
            return {'success': False, 'error': 'psutil not installed'}
        
        disks = []
        system = platform.system()
        
        if system == 'Windows':
            # Windows: 使用 psutil 逻辑磁盘
            for part in psutil.disk_partitions(all=False):
                if 'cdrom' in part.opts.lower():
                    continue
                try:
                    usage = psutil.disk_usage(part.mountpoint)
                    disk_health = get_disk_health()
                    
                    disks.append({
                        'device': part.device,
                        'mountpoint': part.mountpoint,
                        'fstype': part.fstype,
                        'total': round(usage.total / (1024 ** 3), 2),
                        'used': round(usage.used / (1024 ** 3), 2),
                        'free': round(usage.free / (1024 ** 3), 2),
                        'percent': round(usage.percent, 1),
                        'health': disk_health
                    })
                except Exception:
                    pass
                    
        else:
            # Linux/macOS
            try:
                usage = psutil.disk_usage('/')
                disk_health = get_disk_health()
                
                disks.append({
                    'device': '/',
                    'mountpoint': '/',
                    'fstype': 'local',
                    'total': round(usage.total / (1024 ** 3), 2),
                    'used': round(usage.used / (1024 ** 3), 2),
                    'free': round(usage.free / (1024 ** 3), 2),
                    'percent': round(usage.percent, 1),
                    'health': disk_health
                })
            except Exception:
                pass
        
        return {
            'success': True,
            'disks': disks,
            'timestamp': time.time()
        }
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def get_disk_health():
    """获取磁盘健康度 - 基于温度计算健康状态
    
    返回:
        - 'good': 良好 (温度 < 50°C)
        - 'normal': 正常 (50°C <= 温度 < 70°C)
        - 'warning': 警告 (70°C <= 温度 < 85°C)
        - 'bad': 危险 (温度 >= 85°C)
        - 'unknown': 无法获取温度
    """
    try:
        system = platform.system()
        temperature = None
        
        if system == 'Windows':
            # 方法1: OpenHardwareMonitor
            stdout, stderr, rc = run_command(
                'powershell -Command "Get-CimInstance -Namespace \'root\\OpenHardwareMonitor\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq \'Temperature\' -and $_.Name -match \'Disk|HDD|SSD|Temperature\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                timeout=5
            )
            
            if rc == 0 and stdout.strip():
                try:
                    data = json.loads(stdout)
                    if isinstance(data, dict):
                        value = data.get('Value') or data.get('value')
                        if value and isinstance(value, (int, float)) and 0 < value < 150:
                            temperature = float(value)
                            print(f"[DEBUG] OpenHardwareMonitor获取到磁盘温度: {temperature}°C", file=sys.stderr)
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    pass
            
            # 方法2: HWiNFO64
            if temperature is None:
                stdout, stderr, rc = run_command(
                    'powershell -Command "Get-CimInstance -Namespace \'root\\HWiNFO64\' -ClassName Sensor 2>$null | Where-Object {$_.SensorType -eq 0 -and $_.Name -match \'Disk|SSD|HDD\'} | Select-Object -First 1 | ConvertTo-Json -Depth 3"',
                    timeout=5
                )
                
                if rc == 0 and stdout.strip():
                    try:
                        data = json.loads(stdout)
                        if isinstance(data, dict):
                            value = data.get('Value') or data.get('value')
                            if value and isinstance(value, (int, float)) and 0 < value < 150:
                                temperature = float(value)
                                print(f"[DEBUG] HWiNFO64获取到磁盘温度: {temperature}°C", file=sys.stderr)
                    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                        pass
            
            # 方法3: Storage Spaces WMI
            if temperature is None:
                try:
                    stdout, stderr, rc = run_command(
                        'powershell -Command "Get-CimInstance -ClassName MSFT_PhysicalDisk -Namespace \'root\\Microsoft\\Windows\\Storage\' -ErrorAction SilentlyContinue | Select-Object -First 1 Temperature | ForEach-Object { if ($_.Temperature) { $_.Temperature } }"',
                        timeout=5
                    )
                    if rc == 0 and stdout.strip():
                        try:
                            value = float(stdout.strip())
                            if 0 < value < 150:
                                temperature = value
                                print(f"[DEBUG] Storage WMI获取到磁盘温度: {temperature}°C", file=sys.stderr)
                        except ValueError:
                            pass
                except:
                    pass
                    
        elif system == 'Linux':
            # 尝试 smartctl
            try:
                result = subprocess.run(
                    ['smartctl', '-a', '/dev/sda'],
                    capture_output=True, text=True, timeout=2
                )
                if result.returncode == 0:
                    match = re.search(r'Temperature\s+(\d+)', result.stdout)
                    if match:
                        temperature = int(match.group(1))
                        print(f"[DEBUG] smartctl获取到磁盘温度: {temperature}°C", file=sys.stderr)
            except:
                pass
            
            # 尝试读取 sysfs (NVMe)
            if temperature is None:
                import glob
                nvme_paths = [
                    '/sys/class/nvme/*/temperature',
                    '/sys/devices/pci*/nvme/*/temperature'
                ]
                for pattern in nvme_paths:
                    for path in glob.glob(pattern):
                        try:
                            temp = int(open(path, 'r').read().strip())
                            if 0 < temp < 200:
                                temperature = temp
                                print(f"[DEBUG] sysfs NVMe获取到磁盘温度: {temperature}°C", file=sys.stderr)
                                break
                        except:
                            pass
                    if temperature is not None:
                        break
        
        # 根据温度计算健康度
        if temperature is not None:
            if temperature < 50:
                return 'good'
            elif temperature < 70:
                return 'normal'
            elif temperature < 85:
                return 'warning'
            else:
                return 'bad'
        else:
            return 'unknown'
                    
    except Exception as e:
        print(f"[DEBUG] 获取磁盘健康度异常: {str(e)}", file=sys.stderr)
        pass
    
    return 'unknown'


def get_all_system_info():
    """获取所有系统信息"""
    cpu_info = get_cpu_info()
    memory_info = get_memory_info()
    disk_info = get_disk_info()
    
    return {
        'success': True,
        'cpu': cpu_info.get('cpu') if cpu_info.get('success') else None,
        'memory': memory_info.get('memory') if memory_info.get('success') else None,
        'disks': disk_info.get('disks') if disk_info.get('success') else [],
        'timestamp': time.time()
    }


if __name__ == '__main__':
    # 解析命令行参数
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()
        
        if command == 'cpu':
            result = get_cpu_info()
        elif command == 'memory':
            result = get_memory_info()
        elif command == 'disk':
            result = get_disk_info()
        elif command == 'all':
            result = get_all_system_info()
        else:
            result = {'success': False, 'error': f'Unknown command: {command}'}
    else:
        # 默认返回所有信息
        result = get_all_system_info()
    
    print(json.dumps(result, indent=2))
