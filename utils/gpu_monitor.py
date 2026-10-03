#!/usr/bin/env python3
"""
GPU Monitor Plugin for LANStream
使用 nvidia-ml-py3 库获取 NVIDIA GPU 实时数据
"""

import sys
import json
import time

try:
    import pynvml
    
    def get_gpu_info():
        """获取 NVIDIA GPU 实时信息"""
        try:
            pynvml.nvmlInit()
            device_count = pynvml.nvmlDeviceGetCount()
            
            gpus = []
            for i in range(device_count):
                try:
                    handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                    
                    # 获取 GPU 名称
                    name = pynvml.nvmlDeviceGetName(handle)
                    
                    # 获取 GPU 温度
                    temperature = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
                    
                    # 获取 GPU 占用率
                    utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
                    
                    # 获取显存信息
                    memory_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
                    memory_used = memory_info.used / (1024 ** 2)  # 转换为 MB
                    memory_total = memory_info.total / (1024 ** 2)  # 转换为 MB
                    
                    # 获取显存占用率
                    memory_utilization = pynvml.nvmlDeviceGetUtilizationRates(handle).memory
                    
                    # 获取电源使用情况
                    power_usage = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000  # 转换为 W
                    
                    # 获取 GPU 时钟速度
                    clock = pynvml.nvmlDeviceGetClockInfo(handle, pynvml.NVML_CLOCK_GRAPHICS)
                    
                    # 获取 PCI 信息
                    pci_info = pynvml.nvmlDeviceGetPciInfo(handle)
                    pci_bus = pci_info.bus
                    
                    gpu_data = {
                        'index': i,
                        'name': name,
                        'temperature': temperature,
                        'usage': utilization.gpu,
                        'memory_used': round(memory_used, 0),
                        'memory_total': round(memory_total, 0),
                        'memory_usage': memory_utilization,
                        'power_usage': round(power_usage, 1),
                        'clock': clock,
                        'pci_bus': pci_bus,
                        'is_dedicated': True
                    }
                    
                    gpus.append(gpu_data)
                    
                except Exception as e:
                    # 跳过有问题的 GPU
                    continue
            
            pynvml.nvmlShutdown()
            
            return {
                'success': True,
                'count': len(gpus),
                'gpus': gpus,
                'timestamp': time.time()
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'count': 0,
                'gpus': []
            }
    
    if __name__ == '__main__':
        result = get_gpu_info()
        print(json.dumps(result, indent=2))
    
except ImportError:
    # pynvml 不可用时的备用方案
    def get_gpu_info_fallback():
        """备用方案：使用 nvidia-smi 获取 GPU 信息"""
        import subprocess
        
        try:
            # 获取 GPU 列表和基本信息
            result = subprocess.run([
                'nvidia-smi', 
                '--query-gpu=index,name,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,clocks.gr,bus_id',
                '--format=csv,noheader,nounits'
            ], capture_output=True, text=True, timeout=5)
            
            if result.returncode != 0:
                raise Exception(result.stderr)
            
            gpus = []
            lines = result.stdout.strip().split('\n')
            
            for line in lines:
                if not line.strip():
                    continue
                    
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 9:
                    try:
                        gpu_data = {
                            'index': int(parts[0]),
                            'name': parts[1],
                            'temperature': int(parts[2]),
                            'usage': int(parts[3]),
                            'memory_used': float(parts[4]),
                            'memory_total': float(parts[5]),
                            'memory_usage': int((float(parts[4]) / float(parts[5])) * 100) if float(parts[5]) > 0 else 0,
                            'power_usage': float(parts[6]) if parts[6] else 0,
                            'clock': int(parts[7]) if parts[7] else 0,
                            'pci_bus': parts[8],
                            'is_dedicated': True
                        }
                        gpus.append(gpu_data)
                    except (ValueError, IndexError) as e:
                        continue
            
            return {
                'success': True,
                'count': len(gpus),
                'gpus': gpus,
                'timestamp': time.time()
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e),
                'count': 0,
                'gpus': []
            }
    
    if __name__ == '__main__':
        result = get_gpu_info_fallback()
        print(json.dumps(result, indent=2))
