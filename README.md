# SeeDance 2.5 (ByteDance) Text-To-Video Batch Generator CLI Tool

An elegant, robust, highly-efficient Python command-line utility for batch video generation using ByteDance's modern **SeeDance 2.5** (豆包视频大模型) model. 

Designed for content creators, AI developers, and developers seeking automatic high-resolution video production pipelines.

---

## 🌟 Key Features

- ⚡ **Zero-Dependency Core**: Operates fully on Python's built-in `urllib` to ensure instant, dependency-free execution in server sandbox environments.
- 🔄 **Multi-Engine Hub**: Integrated wrappers supporting:
  - **Volcano Ark (火山引擎 火山方舟)**: Direct enterprise access to Doubao (豆包视频).
  - **Fal.ai**: Industry-leading high-speed hosted hosting platform (`fal-ai/seedance/v2.5`).
  - **Replicate**: Versatile hosting (`bytedance-seedance/seedance-2.5`).
- 📂 **Flexible Batch Control**: Load batch parameters via:
  - Multi-line standard text files (`.txt`).
  - Advanced configuration spreadsheets (`.csv`) which support custom aspect-ratios, durations, and init-images per row.
- ⚙️ **ConcurrentTime Tasking**: Submits multiple task states asynchronously in parallel and polls progress smoothly.
- 🗃️ **Automated Reports**: Generates a unified `generation_report.json` document with metadata and completed download paths after execution.

---

## 🛸 Installation & Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ai-models-lab/seedance-2.5.git
   cd seedance-2.5
   ```

2. **Configure API Secrets:**
   Choose your engine and set the corresponding API keys in your environment variables:

   *For Volcano Ark (火山方舟):*
   ```bash
   export VOLC_API_KEY="your-ark-api-key"
   export VOLC_MODEL_ENDPOINT="ep-xxxxxxxxx-xxxxx" # Endpoint ID
   ```

   *For Fal.ai:*
   ```bash
   export FAL_KEY="your-fal-api-key"
   ```

   *For Replicate:*
   ```bash
   export REPLICATE_API_TOKEN="your-replicate-api-token"
   ```

---

## 🛠️ Usage Examples

### 1. Single Generation (Text-to-Video)
Generate a high-quality video using `fal` or `volcengine` directly:
```bash
python seedance_cli.py --engine fal --prompt "A cinematic drone shot of a futuristic neon city in rain, 4k"
```

### 2. Single Generation with Start Image (Image-to-Video)
Initialize video motion blending from an existing photo frame url:
```bash
python seedance_cli.py --engine volcengine --model-endpoint ep-xxxx --prompt "The golden hair sway under golden sunshine, close-up" --image-url "https://example.com/start_frame.jpg"
```

### 3. Batch Generation (CSV File)
Create a `.csv` config document (`my_jobs.csv`) like:
```csv
prompt,image_url,width,height,duration
"Cyberpunk train speeding through rain",,1024,576,5
"A majestic white cat leaping over a fence",,576,1024,5
"Splashing orange juice forming a water castle","https://example.com/juice.jpg",1024,576,10
```

Run batch execution using 3 parallel concurrency workers:
```bash
python seedance_cli.py --engine fal --batch-file my_jobs.csv --concurrency 3 --outputs ./output_batch
```

### 4. Raw Text Line List Generation
Create a simple `.txt` file containing your creative inputs:
```text
A black cat sleeping on a library table.
A mechanical butterfly flying over a flower.
Stardust pouring over an ancient castle ruin.
```
```bash
python seedance_cli.py --batch-file prompts.txt --concurrency 2
```

---

## ⚙️ CLI Parameter Settings

| Variable Name | Alias | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `--prompt` | - | `None` | A single visual description for generation |
| `--image-url` | - | `None` | Optional initial URL for image-to-video motion |
| `--batch-file` | - | `None` | Location path of the `.csv` or `.txt` batch config |
| `--engine` | - | `volcengine` | Endpoint host provider: (`volcengine`, `fal`, `replicate`) |
| `--api-key` | - | `None` | Token overrides standard environment keys |
| `--model-endpoint`| - | `None` | Custom Endpoint ID (e.g. `ep-...`) or custom hosted slug |
| `--width` | - | `1024` | Width dimensions of output frames |
| `--height` | - | `576` | Height dimensions of output frames |
| `--duration` | - | `5` | Length duration in seconds of generated video |
| `--outputs` | - | `outputs` | Target folder destination to save files |
| `--concurrency` | - | `2` | Number of simultaneous queues running concurrently |
| `--poll-interval` | - | `8` | Wait time in seconds between checking job status |

---

## 📜 Chinese Instructions (中文使用指南)

### 安装
1. 克隆本项目：
   ```bash
   git clone https://github.com/ai-models-lab/seedance-2.5.git
   cd seedance-2.5
   ```
2. （可选）安装用于增强控制台日志或第三方SDK的依赖项：
   ```bash
   pip install -r requirements.txt
   ```

### 密钥配置
选择您的服务商并在终端配置环境变量：
- **火山方舟 (Volcano Ark)**:
  ```bash
  export VOLC_API_KEY="您的火山引擎密钥"
  export VOLC_MODEL_ENDPOINT="您的智能体/推理接入点ID" # 格式为 ep-xxx
  ```
- **Fal.ai (国际版 API)**:
  ```bash
  export FAL_KEY="您的Fal API Key"
  ```
- **Replicate**:
  ```bash
  export REPLICATE_API_TOKEN="您的Replicate token"
  ```

### 快速调用指南
1. **单条文本生成视频**:
   ```bash
   python seedance_cli.py --engine volcengine --model-endpoint ep-xxxx --prompt "一个古风红衣侠客独自走在沙漠，武侠风，大片质感"
   ```
2. **多线程批量生成 (使用 CSV 配置文件)**:
   创建一个 `batch.csv` 文件：
   ```csv
   prompt,image_url,width,height,duration
   "一朵郁金香在清晨阳光下绽放",,1024,576,5
   "未来科幻飞船穿越虫洞的时间流速虚化",,1024,576,5
   ```
   启动批量并发生成器（设置并发数为 2）：
   ```bash
   python seedance_cli.py --engine fal --batch-file batch.csv --concurrency 2 --outputs ./my_videos
   ```

---

## 💡 Best Practices

1. **Model Versions**: SeeDance 2.5 performs extraordinarily well at `1024x576` (landscape 16:9) or `576x1024` (portrait 9:16). Duration parameters are best suited at `5` seconds or `10` seconds, depending on endpoint capability.
2. **Rate Limits**: When running large scale jobs, set `--concurrency` to avoid hitting API rate limits specified by Fal.ai or Volcano Ark. Our tool gracefully polls using a background buffer, allowing long tasks to execute without blocking the client.
3. **Report Audits**: Check `generation_report.json` in your specified output directory for a list of successes, timestamps, output locations, and any errors.

## 🤝 Contribution

Feel free to open issues or submit pull requests with additional model adaptors, robust polling optimizations, or CLI parameters. Let's make SeeDance generation convenient and seamless!

## 📄 License

This repository is distributed under the MIT License. Feel free to use and distribute.
