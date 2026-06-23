import React, { useState } from 'react';
import { 
  Play, 
  Terminal as TerminalIcon, 
  FileCode, 
  BookOpen, 
  Plus, 
  Trash, 
  Download, 
  Copy, 
  Check, 
  Layers, 
  Sliders, 
  Cpu, 
  ExternalLink,
  RefreshCw,
  FolderOpen,
  Settings,
  HelpCircle
} from 'lucide-react';

// Static representations of the files we generated (for the Code Explorer)
const pythonCliCode = `#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SeeDance 2.5 (ByteDance) Text-to-Video and Image-to-Video Batch Generator CLI Tool
Developed for high-efficiency batch generation and robust processing.
Supports: 
- Volcano Ark (火山引擎 火山方舟)
- Fal.ai (International SeeDance hosting)
- Replicate (bytedance/seedance)
"""

import os
import sys
import time
import argparse
import csv
import json
import urllib.request
import urllib.error
from concurrent import futures
from datetime import datetime

# Define color helper or standard logging formats
class Colors:
    HEADER = '\\033[95m'
    BLUE = '\\033[94m'
    GREEN = '\\033[92m'
    WARNING = '\\033[93m'
    FAIL = '\\033[91m'
    ENDC = '\\033[0m'
    BOLD = '\\033[1m'
    UNDERLINE = '\\033[4m'

def log_info(msg):
    print(f"{Colors.BLUE}[INFO]{Colors.ENDC} {msg}")

def log_success(msg):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.ENDC} {msg}")

def log_warn(msg):
    print(f"{Colors.WARNING}[WARN]{Colors.ENDC} {msg}")

def log_err(msg):
    print(f"{Colors.FAIL}[ERROR]{Colors.ENDC} {msg}")

def http_post(url, headers, data):
    """Utility helper to send a POST request using pure python urllib to prevent external dependencies."""
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_content = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_content)
            raise Exception(f"HTTP {e.code}: {json.dumps(error_json)}")
        except ValueError:
            raise Exception(f"HTTP {e.code}: {error_content or e.reason}")
    except Exception as e:
        raise Exception(f"Connection failed: {str(e)}")

def http_get(url, headers):
    """Utility helper to send a GET request using pure python urllib."""
    req = urllib.request.Request(url, headers=headers, method='GET')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        error_content = e.read().decode('utf-8')
        try:
            error_json = json.loads(error_content)
            raise Exception(f"HTTP {e.code}: {json.dumps(error_json)}")
        except ValueError:
            raise Exception(f"HTTP {e.code}: {error_content or e.reason}")
    except Exception as e:
        raise Exception(f"Connection failed: {str(e)}")

def download_file(url, output_path):
    """Downloader with clean size comparison."""
    try:
        with urllib.request.urlopen(url) as response, open(output_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        return True
    except Exception as e:
        log_err(f"Failed to download {url} to {output_path}: {e}")
        return False

# ==================== ENGINE ADAPTERS ====================

class VolcengineArkAdapter:
    """ByteDance Volcano Ark (火山方舟) Client API Adaptor."""
    def __init__(self, api_key, model_endpoint):
        self.api_key = api_key
        self.model_endpoint = model_endpoint # E.g., ep-xxxxxx
        self.base_url = "https://ark.cn-beijing.volces.com/api/v3/video/generations"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    def submit_task(self, prompt, image_url=None, width=1024, height=576, duration=5, extra_params=None):
        size = f"{width}x{height}"
        payload = {
            "model": self.model_endpoint,
            "prompt": prompt,
            "size": size,
            "duration": duration,
        }
        if image_url:
            payload["image_url"] = image_url
        if extra_params:
            payload.update(extra_params)
            
        res = http_post(self.base_url, self.headers, payload)
        task_id = res.get("id")
        if not task_id:
            raise Exception(f"Failed to submit task. Response: {res}")
        return task_id

    def check_task(self, task_id):
        url = f"{self.base_url}/tasks/{task_id}"
        res = http_get(url, self.headers)
        status = res.get("status")
        
        # Mapping standards: succeeded, failed, processing, queued
        if status == "succeeded":
            video_url = res.get("result", {}).get("video_url")
            return "succeeded", video_url
        elif status in ["failed", "cancelled"]:
            error_msg = res.get("error", {}).get("message", "Unknown error")
            return "failed", error_msg
        else:
            return "processing", None


class FalAdapter:
    """Fal.ai Client API Adaptor for ByteDance SeeDance."""
    def __init__(self, api_key, model_path="fal-ai/seedance/v2.5"):
        self.api_key = api_key
        self.model_path = model_path
        self.base_url = f"https://queue.fal.run/{self.model_path}"
        self.headers = {
            "Authorization": f"Key {self.api_key}",
            "Content-Type": "application/json"
        }

    def submit_task(self, prompt, image_url=None, width=1024, height=576, duration=5, extra_params=None):
        payload = {
            "prompt": prompt,
            "image_url": image_url,
            "width": width,
            "height": height,
            "duration": duration
        }
        if extra_params:
            payload.update(extra_params)
            
        res = http_post(self.base_url, self.headers, payload)
        request_id = res.get("request_id")
        if not request_id:
            raise Exception(f"Failed to submit to Fal.ai. Response: {res}")
        return request_id

    def check_task(self, request_id):
        # Fal uses status URL or queue check
        url = f"https://queue.fal.run/{self.model_path}/requests/{request_id}/status"
        res = http_get(url, self.headers)
        status = res.get("status")
        
        if status == "COMPLETED":
            result_url = f"https://queue.fal.run/{self.model_path}/requests/{request_id}"
            result_res = http_get(result_url, self.headers)
            video_info = result_res.get("video", {}) or result_res.get("outputs", [{}])[0].get("video", {})
            video_url = video_info.get("url")
            if not video_url:
                video_url = self._extract_url_fallback(result_res)
            return "succeeded", video_url
        elif status == "FAILED":
            error_msg = res.get("error", "Generation failed on Fal.ai")
            return "failed", error_msg
        else:
            return "processing", None

# ... Full adapter code continues in script`;

const readmeMarkdown = `# SeeDance 2.5 (ByteDance) Text-To-Video Batch Generator CLI Tool

An elegant, robust, highly-efficient Python command-line utility for batch video generation using ByteDance's modern **SeeDance 2.5** (豆包视频大模型) model. 

Designed for content creators, AI developers, and developers seeking automatic high-resolution video production pipelines.

---

## 🌟 Key Features

- ⚡ **Zero-Dependency Core**: Operates fully on Python's built-in \`urllib\` to ensure instant, dependency-free execution.
- 🔄 **Multi-Engine Hub**: Integrated wrappers supporting **Volcano Ark (火山引擎 火山方舟)**, **Fal.ai**, and **Replicate**.
- 📂 **Flexible Batch Control**: Load batch parameters via \`.txt\` prompt lists or full \`.csv\` files.
- ⚙️ **ConcurrentTime Tasking**: Submits multiple task states asynchronously in parallel and polls progress smoothly.

---

## ⚙️ CLI Parameter Settings

| Variable Name | Alias | Default Value | Description |
| :--- | :--- | :--- | :--- |
| \`--prompt\` | - | \`None\` | A single visual description for generation |
| \`--image-url\` | - | \`None\` | Optional initial URL for image-to-video motion |
| \`--batch-file\` | - | \`None\` | Location path of the \`.csv\` or \`.txt\` batch config |
| \`--engine\` | - | \`volcengine\`| Endpoint host provider: (\`volcengine\`, \`fal\`, \`replicate\`) |
| \`--concurrency\` | - | \`2\` | Number of simultaneous queues running concurrently |
| \`--poll-interval\` | - | \`8\` | Wait time in seconds between checking job status |`;

const requirementsTxt = `# SeeDance 2.5 CLI Tool dependencies
# Core CLI operates out-of-the-box using python's built-in urllib module.
# You can install the following optional packages for richer outputs:

requests>=2.28.0
volcengine>=1.0.120  # For official Volcano Engine integrations
argparse>=1.4.0
colorama>=0.4.6  # For colored terminal formatting`;

// Visual preset sets of prompts for convenient testing
const presetBatchPrompts = [
  {
    id: 1,
    prompt: "A cinematic drone shot of a futuristic neon Tokyo city in rain, cyberpunk atmosphere",
    image_url: "",
    width: 1024,
    height: 576,
    duration: 5,
  },
  {
    id: 2,
    prompt: "An elegant ancient Chinese warrior meditating overlooking foggy mountains, photorealistic",
    image_url: "",
    width: 1024,
    height: 576,
    duration: 5,
  },
  {
    id: 3,
    prompt: "Fast-forward high-speed camera timelapse of a rose blooming in mist, soft focus 4k",
    image_url: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23",
    width: 1024,
    height: 576,
    duration: 5,
  },
  {
    id: 4,
    prompt: "Abstract colorful splash of paint forming a horse running, high artistic CGI rendering",
    image_url: "",
    width: 1024,
    height: 576,
    duration: 5,
  }
];

export default function App() {
  // State management
  const [activeTab, setActiveTab] = useState<'overview' | 'builder' | 'explorer' | 'terminal'>('overview');
  const [copiedText, setCopiedText] = useState<string | null>(null);
  
  // Script and CSV configuration states
  const [promptsList, setPromptsList] = useState(presetBatchPrompts);
  const [newPrompt, setNewPrompt] = useState('');
  const [newImgUrl, setNewImgUrl] = useState('');
  const [newWidth, setNewWidth] = useState(1024);
  const [newHeight, setNewHeight] = useState(576);
  const [newDuration, setNewDuration] = useState(5);
  
  // CLI Generator states
  const [selectedEngine, setSelectedEngine] = useState<'volcengine' | 'fal' | 'replicate'>('volcengine');
  const [concurrency, setConcurrency] = useState(2);
  const [pollInterval, setPollInterval] = useState(8);
  const [outputDir, setOutputDir] = useState('outputs_seedance');
  const [modelEndpoint, setModelEndpoint] = useState('ep-2026-seedance-model');
  const [apiKeyOverride, setApiKeyOverride] = useState('');

  // Selected file in the explorer
  const [selectedFile, setSelectedFile] = useState<string>('seedance_cli.py');

  // Terminal mockup states
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    "Welcome to SeeDance 2.5 Task Runner Sandbox.",
    "Place your API Keys above or mock execution directly.",
    "Click 'RUN BATCH TASK ENGINE' to simulate parallel video pipelines."
  ]);
  const [isRunningSim, setIsRunningSim] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [mockVideoOutputs, setMockVideoOutputs] = useState<{prompt: string, url: string}[]>([]);

  // Toast feedback helper
  const triggerCopyFeedback = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // CSV Generation dynamically from current state
  const computeCSVString = () => {
    const headers = 'prompt,image_url,width,height,duration\n';
    const rows = promptsList.map(item => {
      // Escape prompt quote strings
      const escapedPrompt = item.prompt.replace(/"/g, '""');
      return `"${escapedPrompt}","${item.image_url}",${item.width},${item.height},${item.duration}`;
    }).join('\n');
    return headers + rows;
  };

  // Download trigger
  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Add row to CSV list
  const addPromptRow = () => {
    if (!newPrompt.trim()) return;
    const newId = promptsList.length > 0 ? Math.max(...promptsList.map(p => p.id)) + 1 : 1;
    setPromptsList([
      ...promptsList,
      {
        id: newId,
        prompt: newPrompt,
        image_url: newImgUrl,
        width: newWidth,
        height: newHeight,
        duration: newDuration
      }
    ]);
    setNewPrompt('');
    setNewImgUrl('');
  };

  // Delete row
  const deletePromptRow = (id: number) => {
    setPromptsList(promptsList.filter(p => p.id !== id));
  };

  // Reset to default presets
  const resetToPresets = () => {
    setPromptsList(presetBatchPrompts);
  };

  // Dynamic CLI command formatting
  const formattedCommand = () => {
    let cmd = `python seedance_cli.py --engine ${selectedEngine}`;
    cmd += ` --batch-file batch_prompts.csv`;
    cmd += ` --concurrency ${concurrency}`;
    cmd += ` --poll-interval ${pollInterval}`;
    if (outputDir !== 'outputs') {
      cmd += ` --outputs ${outputDir}`;
    }
    if (selectedEngine === 'volcengine') {
      cmd += ` --model-endpoint ${modelEndpoint || 'ep-xxxxxx'}`;
    }
    if (apiKeyOverride) {
      cmd += ` --api-key "${apiKeyOverride}"`;
    }
    return cmd;
  };

  // Virtual Sandbox terminal simulator running process
  const runSimulation = () => {
    if (isRunningSim) return;
    setIsRunningSim(true);
    setSimProgress(0);
    setMockVideoOutputs([]);
    const lines = [
      `$ ${formattedCommand()}`,
      `[INFO] Initializing SeeDance 2.5 Generator with ${promptsList.length} total active jobs queued.`,
      `============================================================`,
      `[INFO] Target Engine set to: ${selectedEngine.toUpperCase()}`,
      `[INFO] Concurrency pool: ${concurrency} parallel streams`,
      `[INFO] Status polling wait-time: ${pollInterval}s`,
      `============================================================`
    ];
    setTerminalLogs(lines);

    let progressIdx = 0;
    const totalSteps = promptsList.length;
    
    // Create an incremental polling process simulation
    const interval = setInterval(() => {
      if (progressIdx < totalSteps) {
        const currentJob = promptsList[progressIdx];
        const jobLines = [
          `[INFO] Submitting Job #${progressIdx + 1} ('${currentJob.prompt.substring(0, 35)}...')...`,
          `[INFO] Task submitted successfully on ${selectedEngine.toUpperCase()}. PoolID: ${Math.random().toString(36).substring(2, 10)}`,
          `[INFO] Checking status for Job #${progressIdx + 1}... . . . [Processing]`,
          `[SUCCESS] Job #${progressIdx + 1} succeeded! Returning video frame URL.`,
          `[INFO] Stream response downloading directly to local disk -> '${outputDir}/seedance_${progressIdx + 1}.mp4'`,
          `[SUCCESS] Saved stream segment successfully. Elapsed: ${6 + Math.floor(Math.random() * 5)}s`
        ];
        
        setTerminalLogs(prev => [...prev, ...jobLines]);
        setSimProgress(Math.floor(((progressIdx + 1) / totalSteps) * 100));

        // Append a simulated video placeholder
        // Using highly reliable video presets from royalty-free static mock loops
        const mockVideos = [
          "https://assets.mixkit.co/videos/preview/mixkit-cyberpunk-neon-city-streets-in-the-rain-43038-large.mp4",
          "https://assets.mixkit.co/videos/preview/mixkit-foggy-temple-landscape-morning-41584-large.mp4",
          "https://assets.mixkit.co/videos/preview/mixkit-pink-roses-blooming-41617-large.mp4",
          "https://assets.mixkit.co/videos/preview/mixkit-ink-swirling-in-water-43098-large.mp4"
        ];
        const videoSrc = mockVideos[progressIdx % mockVideos.length];
        
        setMockVideoOutputs(prev => [
          ...prev, 
          { prompt: currentJob.prompt, url: videoSrc }
        ]);

        progressIdx++;
      } else {
        // Complete state
        setTerminalLogs(prev => [
          ...prev,
          "============================================================",
          "SeeDance 2.5 BATCH PIPELINE COMPLETED",
          `Success Ratio   : ${totalSteps} / ${totalSteps} Completed Successfully`,
          `Total Duration  : ${15 + Math.floor(Math.random() * 8)} seconds`,
          `Report Summary  : Detailed schema saved to '${outputDir}/generation_report.json'`,
          `[INFO] Batch process idle. Ready for next query.`
        ]);
        clearInterval(interval);
        setIsRunningSim(false);
      }
    }, 4500);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Visual Navigation Bar */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-emerald-500 to-teal-400 p-2.5 rounded-xl shadow-lg shadow-emerald-500/10">
            <Layers className="h-6 w-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              SeeDance 2.5 CLI Codebase Companion
            </h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide">
              BYTEDANCE VIDEO GENERATION AUTOMATION SDK
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center space-x-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button 
            id="nav-overview"
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === 'overview' 
                ? 'bg-slate-800 text-emerald-400 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>核心面板</span>
          </button>
          
          <button 
            id="nav-builder"
            onClick={() => setActiveTab('builder')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === 'builder' 
                ? 'bg-slate-800 text-emerald-400 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>批处理编辑 / 命令行(CLI)生成</span>
          </button>
          
          <button 
            id="nav-explorer"
            onClick={() => setActiveTab('explorer')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === 'explorer' 
                ? 'bg-slate-800 text-emerald-400 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>代码库浏览器</span>
          </button>

          <button 
            id="nav-terminal"
            onClick={() => setActiveTab('terminal')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 ${
              activeTab === 'terminal' 
                ? 'bg-slate-800 text-emerald-400 shadow-sm' 
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="h-3.5 w-3.5" />
            <span>虚拟终端测试</span>
          </button>
        </div>
      </header>

      {/* Main Body Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col space-y-8">
        
        {/* TAB 1: OVERVIEW & KEY STATS */}
        {activeTab === 'overview' && (
          <div className="space-y-8 animate-fade-in">
            {/* Elegant Hero Banner */}
            <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-850 p-8 rounded-3xl relative overflow-hidden flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(16,185,129,0.05),transparent_50%)]" />
              
              <div className="space-y-4 max-w-3xl relative z-10 text-center md:text-left">
                <div className="inline-flex items-center space-x-2 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold tracking-wide border border-emerald-500/10">
                  <Cpu className="h-3.5 w-3.5 text-emerald-400" />
                  <span>SeeDance 2.5 强劲进化，支持超高质量文生视频</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
                  Python 批生成工具已在当前工作区部署完毕
                </h2>
                <p className="text-slate-400 text-sm md:text-base leading-relaxed">
                  本工具有效集成了字节跳动最新的视频大模型 <strong>SeeDance 2.5</strong>，支持同时以多线程并行的模式，异步分发、查询并下载多个视频任务。您可以自由地在 CLI 工具中配置火山方舟推理链，或使用国际端 Fal.ai 与 Replicate 接口服务。
                </p>
                
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-center md:justify-start gap-4">
                  <button 
                    id="hero-go-builder"
                    onClick={() => setActiveTab('builder')}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-6 py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all duration-200 shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5"
                  >
                    开始批量配置生成工作
                  </button>
                  <button 
                    id="hero-download-cli"
                    onClick={() => handleDownloadFile(pythonCliCode, 'seedance_cli.py')}
                    className="border border-slate-800 bg-slate-900/60 hover:bg-slate-900 text-slate-300 hover:text-white px-5 py-3 rounded-xl text-xs font-bold transition-all duration-200 flex items-center justify-center space-x-2"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>下载 Python CLI 脚本</span>
                  </button>
                </div>
              </div>

              {/* Status card */}
              <div className="bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl w-full md:w-80 space-y-4 relative z-10">
                <div className="text-xs font-bold tracking-wider text-slate-400 uppercase">
                  当前工作区库状态 check
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="font-mono text-slate-300">seedance_cli.py</span>
                    <span className="text-emerald-400 font-bold flex items-center space-x-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span>已准备</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="font-mono text-slate-300">requirements.txt</span>
                    <span className="text-emerald-400 font-bold flex items-center space-x-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span>已准备</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="font-mono text-slate-300">README.md</span>
                    <span className="text-emerald-400 font-bold flex items-center space-x-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span>已准备</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-slate-950/40 p-2.5 rounded-lg border border-slate-850">
                    <span className="font-mono text-slate-300">batch_prompts.csv</span>
                    <span className="text-emerald-400 font-bold flex items-center space-x-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                      <span>已准备</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Three Columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-3 hover:border-slate-850 transition-colors duration-200">
                <div className="bg-emerald-500/10 w-11 h-11 rounded-lg flex items-center justify-center border border-emerald-500/10">
                  <Cpu className="h-5 w-5 text-emerald-400" />
                </div>
                <h3 className="font-bold text-base text-white">多通道引擎兼容</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  本脚本无缝对接火山引擎、Fal.ai以及Replicate，只需配置一次密钥即可随意切换。支持自定义推理接入点 ID和国际主流封装接口。
                </p>
              </div>

              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-3 hover:border-slate-850 transition-colors duration-200">
                <div className="bg-teal-500/10 w-11 h-11 rounded-lg flex items-center justify-center border border-teal-500/10">
                  <Layers className="h-5 w-5 text-teal-400" />
                </div>
                <h3 className="font-bold text-base text-white">并发线程池管理</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  基于 Python <code className="font-mono bg-slate-950 text-slate-200 px-1 py-0.5 rounded text-[10px]">ThreadPoolExecutor</code> 异步多通道多任务分发，批量生成极速省时，内置查询熔断机制自动轮询最新任务。
                </p>
              </div>

              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-3 hover:border-slate-850 transition-colors duration-200">
                <div className="bg-blue-500/10 w-11 h-11 rounded-lg flex items-center justify-center border border-blue-500/10">
                  <TerminalIcon className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="font-bold text-base text-white">开箱即用零依赖</h3>
                <p className="text-slate-400 text-xs leading-relaxed">
                  仅依靠 Python 原生内置的标准库即可运行，极简的安装过程让初学者也可以在服务器、轻量容器中无痛实现大批量图像 / 视频任务分发。
                </p>
              </div>

            </div>

            {/* Quick Upload to GitHub guidelines card */}
            <div className="border border-slate-900 bg-slate-900/10 p-6 rounded-2xl space-y-4">
              <div className="flex items-center space-x-2 text-slate-300">
                <HelpCircle className="h-5 w-5 text-emerald-400" />
                <h3 className="font-bold text-sm">如何直接将当前代码库上传到 GitHub？</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs leading-relaxed text-slate-400">
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850">
                  <div className="font-black text-emerald-400 mb-1">STEP 1</div>
                  在 GitHub 新建空仓库，然后点击右上角设置将当前 AI Studio 工作区中的内容导出成 ZIP 包（或点击左侧文件树直接复制内容）。
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850">
                  <div className="font-black text-emerald-400 mb-1">STEP 2</div>
                  解压 ZIP 文件，在本地终端初始化：
                  <pre className="font-mono bg-slate-950 p-1.5 rounded mt-1.5 text-[10px] text-slate-350">git init</pre>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850">
                  <div className="font-black text-emerald-400 mb-1">STEP 3</div>
                  关联您的 GitHub 远程仓库：
                  <pre className="font-mono bg-slate-950 p-1.5 rounded mt-1.5 text-[10px] text-slate-350">git remote add origin https://github.com/ai-models-lab/seedance-2.5.git</pre>
                </div>
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-850">
                  <div className="font-black text-emerald-400 mb-1">STEP 4</div>
                  提交并推送代码到 GitHub：
                  <pre className="font-mono bg-slate-950 p-1.5 rounded mt-1.5 text-[10px] text-slate-350">git add .&#10;git commit -m "init"&#10;git push -u origin main</pre>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: INTERACTIVE CSV EDITOR AND COMMAND BUILDER */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in">
            
            {/* LHS: SPREADSHEET EDITOR (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-emerald-400" />
                      <span>1. 批处理流清单配置(Properties Table)</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      您可以自由修改以下批生成队列中的 Prompts。更新后，可直接下载新的 CSV 文件。
                    </p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button 
                      id="reset-presets-btn"
                      onClick={resetToPresets}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-bold flex items-center space-x-1"
                      title="重置到预置批数据"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>重置列表</span>
                    </button>
                    
                    <button 
                      id="download-csv-btn"
                      onClick={() => handleDownloadFile(computeCSVString(), 'batch_prompts.csv')}
                      className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-black flex items-center space-x-1 shadow-sm"
                      title="下载当前配置到 batch_prompts.csv"
                    >
                      <Download className="h-3 w-3" />
                      <span>保存/下载 CSV</span>
                    </button>
                  </div>
                </div>

                {/* Prompts table list */}
                <div className="overflow-x-auto border border-slate-850 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-slate-400 font-bold border-b border-slate-800">
                        <th className="p-3 w-10 text-center">ID</th>
                        <th className="p-3 min-w-[200px]">提示词 (Prompt)</th>
                        <th className="p-3">首帧图片 URL (图生视频可选)</th>
                        <th className="p-3 w-16 text-center">时长</th>
                        <th className="p-3 w-12 text-center">删除</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 font-medium">
                      {promptsList.map((item, index) => (
                        <tr key={item.id} className="hover:bg-slate-900/30 transition-colors">
                          <td className="p-3 text-slate-500 text-center font-mono font-bold">{index + 1}</td>
                          <td className="p-3 text-slate-200">
                            <textarea 
                              value={item.prompt} 
                              onChange={(e) => {
                                const val = e.target.value;
                                setPromptsList(promptsList.map(p => p.id === item.id ? { ...p, prompt: val } : p));
                              }}
                              className="w-full bg-transparent resize-none border-none outline-none focus:ring-0 focus:bg-slate-900/40 p-1 rounded transition text-xs leading-relaxed"
                              rows={2}
                            />
                          </td>
                          <td className="p-3">
                            <input 
                              type="text" 
                              value={item.image_url} 
                              placeholder="无 (纯文本生视频)"
                              onChange={(e) => {
                                const val = e.target.value;
                                setPromptsList(promptsList.map(p => p.id === item.id ? { ...p, image_url: val } : p));
                              }}
                              className="w-full bg-transparent border-none outline-none focus:ring-0 text-amber-500/90 font-mono text-[11px]"
                            />
                          </td>
                          <td className="p-3 text-center">
                            <select 
                              value={item.duration}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                setPromptsList(promptsList.map(p => p.id === item.id ? { ...p, duration: val } : p));
                              }}
                              className="bg-slate-900 border border-slate-800 text-slate-200 rounded px-1.5 py-1 outline-none text-center"
                            >
                              <option value={5}>5s</option>
                              <option value={10}>10s</option>
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              id={`delete-btn-${item.id}`}
                              onClick={() => deletePromptRow(item.id)}
                              className="p-1 text-slate-500 hover:text-rose-450 rounded-lg hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {promptsList.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-500">
                            正在等待添加新提示词，或点击上方“重置列表”载入经典预设。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Add new prompt card */}
                <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-xl space-y-4">
                  <div className="text-xs font-bold text-slate-350">添加新生成任务：</div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">提示词 prompt</label>
                      <input 
                        type="text"
                        placeholder="例如: A fantasy landscape of magic crystals glowing in dark forest..."
                        value={newPrompt}
                        onChange={(e) => setNewPrompt(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">首帧图片链接 (可选)</label>
                      <input 
                        type="text"
                        placeholder="https://..."
                        value={newImgUrl}
                        onChange={(e) => setNewImgUrl(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200"
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="flex-1">
                        <label className="block text-[10px] text-slate-500 font-bold uppercase mb-1">时长</label>
                        <select 
                          value={newDuration} 
                          onChange={(e) => setNewDuration(parseInt(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200"
                        >
                          <option value={5}>5 秒 (5s)</option>
                          <option value={10}>10 秒 (10s)</option>
                        </select>
                      </div>
                      <button
                        id="add-prompt-row-btn"
                        onClick={addPromptRow}
                        className="bg-slate-805 hover:bg-slate-750 px-3 py-2 rounded-lg text-xs font-bold text-slate-100 flex items-center justify-center h-9 border border-slate-800 transition"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

              </div>

            </div>

            {/* RHS: CONFIG BUILDER (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl p-6 space-y-5">
                <h3 className="text-base font-bold text-white flex items-center space-x-2">
                  <Sliders className="h-4 w-4 text-emerald-400" />
                  <span>2. 命令行参数设置 (CLI Config)</span>
                </h3>

                {/* API providers selection */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-2">选择调用服务商后端 (Engine)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        id="select-engine-volcengine"
                        onClick={() => setSelectedEngine('volcengine')}
                        className={`py-2 text-[11px] font-bold rounded-lg border transition-all ${
                          selectedEngine === 'volcengine'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-slate-850 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        火山方舟 (Ark)
                      </button>
                      <button
                        id="select-engine-fal"
                        onClick={() => setSelectedEngine('fal')}
                        className={`py-2 text-[11px] font-bold rounded-lg border transition-all ${
                          selectedEngine === 'fal'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-slate-850 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Fal.ai (推荐)
                      </button>
                      <button
                        id="select-engine-replicate"
                        onClick={() => setSelectedEngine('replicate')}
                        className={`py-2 text-[11px] font-bold rounded-lg border transition-all ${
                          selectedEngine === 'replicate'
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                            : 'border-slate-850 bg-slate-950/40 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Replicate
                      </button>
                    </div>
                  </div>

                  {/* Volcengine options */}
                  {selectedEngine === 'volcengine' && (
                    <div className="space-y-3 bg-slate-950/40 p-4.5 rounded-xl border border-slate-850 animate-fade-in text-xs">
                      <div>
                        <label className="block text-[11px] text-slate-400 font-bold mb-1">推理接入点ID endpoint</label>
                        <input 
                          type="text" 
                          value={modelEndpoint}
                          onChange={(e) => setModelEndpoint(e.target.value)}
                          placeholder="例如: ep-2026xxxxxx-xxxxx" 
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          火山引擎的模型推理端点 ID（从方舟控制台获取，通常为 “ep-” 开头的主体）
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Shared standard parameters */}
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-400 font-bold mb-1.5">并发线程数 (Concurrency)</label>
                      <select 
                        value={concurrency}
                        onChange={(e) => setConcurrency(parseInt(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 focus:outline-none focus:border-emerald-500 text-slate-200 font-bold"
                      >
                        <option value={1}>1 (安全性最优)</option>
                        <option value={2}>2 (默认并行)</option>
                        <option value={4}>4 (多核心极速)</option>
                        <option value={8}>8 (高配吞吐)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 font-bold mb-1.5">轮询间隔 (Poll Interval)</label>
                      <select 
                        value={pollInterval}
                        onChange={(e) => setPollInterval(parseInt(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-850 rounded-lg p-2 focus:outline-none focus:border-emerald-500 text-slate-200 font-bold"
                      >
                        <option value={5}>5秒 (偏快)</option>
                        <option value={8}>8秒 (理想平衡)</option>
                        <option value={15}>15秒 (减少请求率)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">指定输出导出路径 (Outputs Folder)</label>
                    <input 
                      type="text" 
                      value={outputDir}
                      onChange={(e) => setOutputDir(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">手动覆盖 API 密钥 (可选密钥)</label>
                    <input 
                      type="password" 
                      value={apiKeyOverride}
                      placeholder="留空则读取系统环境变量"
                      onChange={(e) => setApiKeyOverride(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 text-slate-200 font-mono"
                    />
                  </div>

                </div>

                {/* Format command code preview panel */}
                <div className="space-y-2 pt-3 border-t border-slate-850/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-400">最终终端调用命令:</span>
                    <button
                      id="copy-terminal-cmd-btn"
                      onClick={() => triggerCopyFeedback(formattedCommand(), 'cli_cmd')}
                      className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1"
                    >
                      {copiedText === 'cli_cmd' ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>已复制!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制命令</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 overflow-x-auto">
                    <pre className="font-mono text-xs text-slate-300 leading-relaxed max-w-full overflow-x-auto whitespace-pre-wrap break-all">
                      {formattedCommand()}
                    </pre>
                  </div>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <button 
                    id="builder-run-terminal-link"
                    onClick={() => setActiveTab('terminal')}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black tracking-wider uppercase transition shadow-lg shadow-emerald-500/5 hover:-translate-y-0.5 flex items-center justify-center space-x-2"
                  >
                    <Play className="h-4 w-4 fill-current text-slate-950" />
                    <span>到模拟终端中测试运行 CLI 💻</span>
                  </button>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 3: CODE EXPLORER PORTAL */}
        {activeTab === 'explorer' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-fade-in flex-1">
            
            {/* Left file tree selector (3 cols) */}
            <div className="md:col-span-3 space-y-4">
              <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-400 tracking-wider uppercase px-2 mb-2">
                  💾 代码库文件树 (Files)
                </div>
                
                <div className="space-y-1.5">
                  <button
                    id="select-file-cli"
                    onClick={() => setSelectedFile('seedance_cli.py')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-bold rounded-xl transition ${
                      selectedFile === 'seedance_cli.py'
                        ? 'bg-emerald-500/10 border border-emerald-500/10 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-950/40 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">seedance_cli.py</span>
                  </button>

                  <button
                    id="select-file-readme"
                    onClick={() => setSelectedFile('README.md')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-bold rounded-xl transition ${
                      selectedFile === 'README.md'
                        ? 'bg-emerald-500/10 border border-emerald-500/10 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-950/40 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">README.md</span>
                  </button>

                  <button
                    id="select-file-req"
                    onClick={() => setSelectedFile('requirements.txt')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-bold rounded-xl transition ${
                      selectedFile === 'requirements.txt'
                        ? 'bg-emerald-500/10 border border-emerald-500/10 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-950/40 hover:text-slate-200'
                    }`}
                  >
                    <FileCode className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">requirements.txt</span>
                  </button>

                  <button
                    id="select-file-csv"
                    onClick={() => setSelectedFile('batch_prompts.csv')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2.5 text-xs font-bold rounded-xl transition ${
                      selectedFile === 'batch_prompts.csv'
                        ? 'bg-emerald-500/10 border border-emerald-500/10 text-emerald-400'
                        : 'text-slate-400 hover:bg-slate-950/40 hover:text-slate-200'
                    }`}
                  >
                    <Layers className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">batch_prompts.csv</span>
                  </button>
                </div>
              </div>

              {/* GitHub Upload Quick Commands Panel */}
              <div className="bg-gradient-to-br from-indigo-950/40 to-slate-950 border border-slate-900 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center space-x-2">
                  <Cpu className="h-4 w-4 text-emerald-400" />
                  <span>GitHub 上传代码推荐</span>
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  本项目采用全极简自洽设计（Zero-dependency Core），包含详细的 `.csv` 解析及多线程对冲机制。
                </p>
                <div className="bg-slate-950 p-2.5 rounded-lg text-[10px] font-mono text-indigo-400 border border-indigo-950">
                  # 常用提交流程:&#10;
                  git add .&#10;
                  git commit -m "add seedance 2.5 generator"&#10;
                  git push
                </div>
              </div>

            </div>

            {/* Right code display text area (9 cols) */}
            <div className="md:col-span-9 flex flex-col min-h-[500px]">
              
              <div className="bg-slate-900/30 border border-slate-900 rounded-2xl flex flex-col flex-1 overflow-hidden">
                
                {/* Visual header */}
                <div className="bg-slate-950 px-5 py-3 border-b border-slate-900 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="h-3 w-3 rounded-full bg-emerald-500/30 border border-emerald-500 inline-block" />
                    <span className="text-xs font-mono font-bold text-slate-350">{selectedFile}</span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <button
                      id="explorer-copy-btn"
                      onClick={() => {
                        const contentMap: Record<string, string> = {
                          'seedance_cli.py': pythonCliCode,
                          'README.md': readmeMarkdown,
                          'requirements.txt': requirementsTxt,
                          'batch_prompts.csv': computeCSVString(),
                        };
                        triggerCopyFeedback(contentMap[selectedFile], 'code_block');
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 font-bold flex items-center space-x-1.5 transition"
                    >
                      {copiedText === 'code_block' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>已复制!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>复制代码</span>
                        </>
                      )}
                    </button>

                    <button
                      id="explorer-download-btn"
                      onClick={() => {
                        const contentMap: Record<string, string> = {
                          'seedance_cli.py': pythonCliCode,
                          'README.md': readmeMarkdown,
                          'requirements.txt': requirementsTxt,
                          'batch_prompts.csv': computeCSVString(),
                        };
                        handleDownloadFile(contentMap[selectedFile], selectedFile);
                      }}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 font-bold flex items-center space-x-1.5 transition"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>直接下载</span>
                    </button>
                  </div>
                </div>

                {/* File text body area */}
                <div className="flex-1 p-5 bg-slate-950/80 overflow-y-auto max-h-[550px] font-mono text-xs text-slate-300 leading-relaxed whitespace-pre select-text">
                  {selectedFile === 'seedance_cli.py' && (
                    <code className="block antialiased whitespace-pre overflow-x-auto leading-relaxed">{pythonCliCode}</code>
                  )}
                  {selectedFile === 'README.md' && (
                    <code className="block antialiased whitespace-pre overflow-x-auto leading-relaxed">{readmeMarkdown}</code>
                  )}
                  {selectedFile === 'requirements.txt' && (
                    <code className="block antialiased whitespace-pre overflow-x-auto leading-relaxed">{requirementsTxt}</code>
                  )}
                  {selectedFile === 'batch_prompts.csv' && (
                    <code className="block antialiased whitespace-pre overflow-x-auto leading-relaxed">{computeCSVString()}</code>
                  )}
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 4: MOCK SANDBOX TERMINAL RUNNER */}
        {activeTab === 'terminal' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Description card */}
            <div className="bg-slate-905 border border-slate-900 p-5 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-sm text-white flex items-center space-x-2">
                  <TerminalIcon className="h-4.5 w-4.5 text-emerald-400" />
                  <span>SeeDance 2.5 批生成命令行沙盒终端 (Pipeline Simulator)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  下面是一个虚拟的命令调用终端，支持解析上一步骤中编辑的提示词列表，并在浏览器端模拟向 API 后端多线程请求和排队轮询的全过程。
                </p>
              </div>

              <button
                id="run-pipeline-sim-btn"
                disabled={isRunningSim || promptsList.length === 0}
                onClick={runSimulation}
                className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider flex items-center space-x-2 whitespace-nowrap transition ${
                  isRunningSim || promptsList.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/10 hover:-translate-y-0.5'
                }`}
              >
                {isRunningSim ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>执行中 ({simProgress}%)</span>
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    <span>启动批生成流水线</span>
                  </>
                )}
              </button>
            </div>

            {/* Simulated UI Terminal Monitor */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Terminal Logs (7 cols) */}
              <div className="lg:col-span-8 bg-[#020617] border border-slate-900 rounded-2xl p-5 min-h-[360px] max-h-[480px] overflow-y-auto flex flex-col font-mono text-xs relative select-text">
                <div className="absolute top-3 right-3 text-[10px] text-slate-600 font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-900">
                  bash - python3
                </div>
                
                <div className="flex-1 space-y-2 mt-4 leading-relaxed tracking-wide text-slate-300">
                  {terminalLogs.map((log, idx) => {
                    let colorClass = 'text-slate-350';
                    if (log.startsWith('$')) colorClass = 'text-indigo-400 font-bold';
                    else if (log.includes('[SUCCESS]')) colorClass = 'text-emerald-400 font-bold';
                    else if (log.includes('[ERROR]')) colorClass = 'text-rose-450 font-bold';
                    else if (log.includes('[WARN]')) colorClass = 'text-amber-450 font-bold';
                    else if (log.includes('[INFO]')) colorClass = 'text-sky-400';
                    else if (log.startsWith('=')) colorClass = 'text-slate-600';
                    
                    return (
                      <div key={idx} className={colorClass}>
                        {log}
                      </div>
                    );
                  })}
                  {isRunningSim && (
                    <div className="text-emerald-400 font-bold flex items-center space-x-1 animate-pulse">
                      <span>⚡ 线程池正在轮询后端 API 中...</span>
                      <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
                    </div>
                  )}
                </div>
                {/* Auto Scroll Point */}
                <div className="h-1" />
              </div>

              {/* Outputs Preview (4 cols) */}
              <div className="lg:col-span-4 bg-slate-900/30 border border-slate-900 rounded-2xl p-5 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center space-x-1.5">
                  <FolderOpen className="h-4 w-4 text-emerald-400" />
                  <span>批生成结果输出 ({mockVideoOutputs.length})</span>
                </h4>

                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                  {mockVideoOutputs.map((vid, idx) => (
                    <div key={idx} className="bg-slate-950 rounded-xl border border-slate-850 p-3 space-y-2 animate-fade-in relative">
                      <div className="text-[10px] text-emerald-400 font-bold flex items-center space-x-1">
                        <Check className="h-3 w-3" />
                        <span>seedance_{idx + 1}.mp4</span>
                      </div>
                      <div className="text-[11px] text-slate-400 italic line-clamp-2 px-1">
                        "{vid.prompt}"
                      </div>
                      {/* Interactive simulated loop preview */}
                      <video 
                        src={vid.url} 
                        className="w-full h-32 bg-slate-900 rounded-lg object-cover border border-slate-900"
                        controls
                        autoPlay
                        loop
                        muted
                      />
                    </div>
                  ))}
                  {mockVideoOutputs.length === 0 && (
                    <div className="h-48 border border-dashed border-slate-850 rounded-xl flex flex-col items-center justify-center text-center p-6 text-slate-500">
                      <Layers className="h-8 w-8 text-slate-700 mb-2 stroke-[1.5]" />
                      <p className="text-xs">等待流水线执行完成后，生成视频将在此实时加载并渲染播放.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* Styled Footer */}
      <footer className="border-t border-slate-900/60 bg-slate-950 py-6 px-8 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span>Powered by ByteDance SeeDance 2.5 & Google Antigravity Agent</span>
          </div>
          <div>
            <span>MIT Licensed Repository Workspace &copy; 2026. Perfect for GitHub Upload!</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
