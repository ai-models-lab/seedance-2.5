#!/usr/bin/env python3
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
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

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
            # Forcompleted tasks, retrieve result
            result_url = f"https://queue.fal.run/{self.model_path}/requests/{request_id}"
            result_res = http_get(result_url, self.headers)
            # Find video URL
            video_info = result_res.get("video", {}) or result_res.get("outputs", [{}])[0].get("video", {})
            video_url = video_info.get("url")
            if not video_url:
                # Fallback to search recursively for urls ending with mp4
                video_url = self._extract_url_fallback(result_res)
            return "succeeded", video_url
        elif status == "FAILED":
            error_msg = res.get("error", "Generation failed on Fal.ai")
            return "failed", error_msg
        else:
            return "processing", None

    def _extract_url_fallback(self, data):
        if isinstance(data, dict):
            for k, v in data.items():
                if k == "url" and str(v).endswith(".mp4"):
                    return v
                ret = self._extract_url_fallback(v)
                if ret: return ret
        elif isinstance(data, list):
            for val in data:
                ret = self._extract_url_fallback(val)
                if ret: return ret
        return None


class ReplicateAdapter:
    """Replicate Client API Adaptor for SeeDance."""
    def __init__(self, api_key, model_slug="bytedance-seedance/seedance-2.5"):
        self.api_key = api_key
        # Split model slug
        self.model_slug = model_slug
        self.headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json"
        }

    def submit_task(self, prompt, image_url=None, width=1024, height=576, duration=5, extra_params=None):
        url = "https://api.replicate.com/v1/predictions"
        # Extract version if possible, or trigger general request
        input_data = {
            "prompt": prompt,
            "width": width,
            "height": height,
            "duration": duration
        }
        if image_url:
            input_data["image"] = image_url
            
        payload = {
            "version": "latest", # By default Replicate allows specifying via model slug directly
            "model": self.model_slug,
            "input": input_data
        }
        if extra_params:
            payload["input"].update(extra_params)
            
        res = http_post(url, self.headers, payload)
        prediction_id = res.get("id")
        if not prediction_id:
            raise Exception(f"Failed to submit task on Replicate. Response: {res}")
        return prediction_id

    def check_task(self, prediction_id):
        url = f"https://api.replicate.com/v1/predictions/{prediction_id}"
        res = http_get(url, self.headers)
        status = res.get("status")
        
        if status == "succeeded":
            output = res.get("output")
            # Output can be a single URL string or a list of URLs
            if isinstance(output, list) and len(output) > 0:
                return "succeeded", output[0]
            elif isinstance(output, str):
                return "succeeded", output
            return "failed", "No valid output url found"
        elif status == "failed":
            error_msg = res.get("error", "Generation failed on Replicate")
            return "failed", error_msg
        else:
            return "processing", None

# ==================== MAIN TASK WORKER ====================

def run_single_job(job_index, prompt, image_url, engine, width, height, duration, output_dir, adapter, poll_interval=10, timeout=300):
    """Processes a single task item complete with submitting, polling, and downloading."""
    t_start = time.time()
    task_desc = f"Job #{job_index} ('{prompt[:30]}...')"
    log_info(f"Submitting {task_desc} to {engine}...")
    
    try:
        task_id = adapter.submit_task(
            prompt=prompt,
            image_url=image_url,
            width=width,
            height=height,
            duration=duration
        )
        log_info(f"Task submitted successfully. TaskID: {task_id}. Polling...")
    except Exception as e:
        log_err(f"Submission failed for {task_desc}: {e}")
        return {
            "index": job_index,
            "prompt": prompt,
            "status": "failed_submission",
            "error": str(e),
            "file": None,
            "duration": time.time() - t_start
        }

    # Polling loops
    while True:
        elapsed = time.time() - t_start
        if elapsed > timeout:
            log_err(f"Timeout reached ({timeout}s) for {task_desc}.")
            return {
                "index": job_index,
                "prompt": prompt,
                "status": "timeout",
                "error": f"Timeout after {timeout}s",
                "file": None,
                "duration": elapsed
            }
            
        try:
            status, result = adapter.check_task(task_id)
            if status == "succeeded":
                video_url = result
                log_success(f"Task {task_id} succeeded! Video URL: {video_url}")
                
                # Setup output file name
                safe_prompt = "".join([c if c.isalnum() or c in " _-" else "_" for c in prompt[:25]]).strip()
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                file_name = f"seedance_{job_index}_{safe_prompt}_{timestamp}.mp4"
                output_path = os.path.join(output_dir, file_name)
                
                log_info(f"Downloading video to {output_path}...")
                dl_ok = download_file(video_url, output_path)
                
                if dl_ok:
                    log_success(f"Successfully saved stream source to: {output_path}")
                    return {
                        "index": job_index,
                        "prompt": prompt,
                        "status": "completed",
                        "error": None,
                        "file": output_path,
                        "url": video_url,
                        "duration": time.time() - t_start
                    }
                else:
                    return {
                        "index": job_index,
                        "prompt": prompt,
                        "status": "failed_download",
                        "error": "Failed to download generated file stream",
                        "file": None,
                        "url": video_url,
                        "duration": time.time() - t_start
                    }
            elif status == "failed":
                log_err(f"Task {task_id} failed: {result}")
                return {
                    "index": job_index,
                    "prompt": prompt,
                    "status": "failed_generation",
                    "error": result,
                    "file": None,
                    "duration": time.time() - t_start
                }
            else:
                # Print subtle polling status
                sys.stdout.write(f".")
                sys.stdout.flush()
                
        except Exception as e:
            log_warn(f"Error checking {task_desc} (will retry): {e}")
            
        time.sleep(poll_interval)


def main():
    parser = argparse.ArgumentParser(
        description=f"{Colors.BOLD}SeeDance 2.5 Batch Video Generator (Pure Python Tool){Colors.ENDC}",
        formatter_class=argparse.RawTextHelpFormatter
    )
    
    # Core input options
    parser.add_argument("--prompt", type=str, help="Single visual prompt for Text-to-Video generation")
    parser.add_argument("--image-url", type=str, help="Optional image URL for Image-to-Video generation")
    parser.add_argument("--batch-file", type=str, help="Path to batch configuration spreadsheet (CSV) or list (TXT)")
    
    # Engine Settings
    parser.add_argument("--engine", type=str, choices=["volcengine", "fal", "replicate"], default="volcengine",
                        help="API Endpoint provider. Choose: 'volcengine', 'fal', 'replicate' (default: volcengine)")
    parser.add_argument("--api-key", type=str, help="Provider Access Token/Secret API Key. Overrides Environment variables")
    parser.add_argument("--model-endpoint", type=str, help="Custom specific Model endpoint (e.g. ep-xxx for Volcengine; fal-ai/seedance/v2.5 for Fal)")
    
    # Generation parameters
    parser.add_argument("--width", type=int, default=1024, help="Width of video (default: 1024)")
    parser.add_argument("--height", type=int, default=576, help="Height of video (default: 576)")
    parser.add_argument("--duration", type=int, default=5, help="Seconds length output (default: 5)")
    parser.add_argument("--outputs", type=str, default="outputs", help="Directory where files are stored (default: 'outputs')")
    parser.add_argument("--concurrency", type=int, default=2, help="Number of concurrent worker requests to process (default: 2)")
    parser.add_argument("--poll-interval", type=int, default=8, help="Task querying wait seconds (default: 8)")
    
    args = parser.parse_args()

    # Verify Output directory exists
    if not os.path.exists(args.outputs):
        os.makedirs(args.outputs)

    # Determine standard keys
    api_key = args.api_key
    if not api_key:
        if args.engine == "volcengine":
            api_key = os.environ.get("VOLC_API_KEY") or os.environ.get("ARK_API_KEY")
        elif args.engine == "fal":
            api_key = os.environ.get("FAL_KEY") or os.environ.get("FAL_API_KEY")
        elif args.engine == "replicate":
            api_key = os.environ.get("REPLICATE_API_TOKEN")

    if not api_key:
        log_err(f"No API key provided! Please configure via --api-key or environment variables.\n"
                f"  - Volcengine: VOLC_API_KEY / ARK_API_KEY\n"
                f"  - Fal.ai: FAL_KEY\n"
                f"  - Replicate: REPLICATE_API_TOKEN")
        sys.exit(1)

    # Instantiate adapter
    adapter = None
    if args.engine == "volcengine":
        endpoint = args.model_endpoint or os.environ.get("VOLC_MODEL_ENDPOINT")
        if not endpoint:
            log_err("Volcengine require a Model Endpoint ID (--model-endpoint or VOLC_MODEL_ENDPOINT Environment variable)")
            sys.exit(1)
        adapter = VolcengineArkAdapter(api_key, endpoint)
    elif args.engine == "fal":
        endpoint = args.model_endpoint or "fal-ai/seedance/v2.5"
        adapter = FalAdapter(api_key, endpoint)
    elif args.engine == "replicate":
        endpoint = args.model_endpoint or "bytedance-seedance/seedance-2.5"
        adapter = ReplicateAdapter(api_key, endpoint)

    # Build queue list of prompts
    jobs = []
    if args.batch_file:
        file_path = args.batch_file
        if not os.path.exists(file_path):
            log_err(f"Batch file not found: {file_path}")
            sys.exit(1)
            
        if file_path.endswith('.csv'):
            try:
                with open(file_path, newline='', encoding='utf-8') as f:
                    reader = csv.DictReader(f)
                    # Check headers
                    for idx, row in enumerate(reader, 1):
                        prompt_text = row.get("prompt")
                        if not prompt_text:
                            # Try to get the first column
                            prompt_text = next(iter(row.values()))
                        if prompt_text:
                            jobs.append({
                                "index": idx,
                                "prompt": prompt_text.strip(),
                                "image_url": row.get("image_url", "").strip() or None,
                                "width": int(row.get("width", args.width)),
                                "height": int(row.get("height", args.height)),
                                "duration": int(row.get("duration", args.duration))
                            })
            except Exception as e:
                log_err(f"Failed to read CSV spreadsheet: {e}")
                sys.exit(1)
        else:
            # Assume TXT newline-separated prompts
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines = [line.strip() for line in f if line.strip() and not line.startswith('#')]
                    for idx, line in enumerate(lines, 1):
                        jobs.append({
                            "index": idx,
                            "prompt": line,
                            "image_url": None,
                            "width": args.width,
                            "height": args.height,
                            "duration": args.duration
                        })
            except Exception as e:
                log_err(f"Failed to read raw TXT file: {e}")
                sys.exit(1)
    elif args.prompt:
        jobs.append({
            "index": 1,
            "prompt": args.prompt,
            "image_url": args.image_url,
            "width": args.width,
            "height": args.height,
            "duration": args.duration
        })
    else:
         log_err("Required text parameters missing! Provide a single prompt with --prompt or compile lists with --batch-file.")
         sys.exit(1)

    total_jobs = len(jobs)
    log_info(f"Initialized SeeDance 2.5 Generator with {total_jobs} total active jobs queued.")
    print("=" * 60)

    # Run tasks concurrently using ThreadPoolExecutor
    results = []
    t_pipeline_start = time.time()
    
    with futures.ThreadPoolExecutor(max_workers=min(args.concurrency, total_jobs)) as executor:
        future_to_job = {
            executor.submit(
                run_single_job,
                job["index"], job["prompt"], job["image_url"],
                args.engine, job["width"], job["height"], job["duration"],
                args.outputs, adapter, args.poll_interval
            ): job for job in jobs
        }
        
        for idx, future in enumerate(futures.as_completed(future_to_job), 1):
            job = future_to_job[future]
            try:
                data = future.result()
                results.append(data)
                percentage = (idx / total_jobs) * 100
                print() # Ensure formatting carriage break
                log_info(f"Progress update: {idx}/{total_jobs} ({percentage:.1f}%) Completed")
                print("-" * 60)
            except Exception as exc:
                log_err(f"Internal generation thread exception occurred: {exc}")

    # Generate complete final report
    duration_total = time.time() - t_pipeline_start
    completed_jobs = [r for r in results if r["status"] == "completed"]
    failed_jobs = [r for r in results if r["status"] != "completed"]

    print("=" * 60)
    print(f"{Colors.BOLD}SeeDance 2.5 BATCH PIPELINE COMPLETED{Colors.ENDC}")
    print(f"Total Time Taken : {duration_total:.2f} seconds")
    print(f"Success Ratio    : {Colors.GREEN}{len(completed_jobs)} / {total_jobs}{Colors.ENDC}")
    if failed_jobs:
        print(f"Failed Count     : {Colors.FAIL}{len(failed_jobs)}{Colors.ENDC}")
    print(f"Destination Path : '{args.outputs}/'")

    # Save details into JSON summary
    summary_path = os.path.join(args.outputs, "generation_report.json")
    report_data = {
        "timestamp": datetime.now().isoformat(),
        "engine": args.engine,
        "concurrency": args.concurrency,
        "total_jobs": total_jobs,
        "success_jobs": len(completed_jobs),
        "failed_jobs": len(failed_jobs),
        "total_duration_sec": duration_total,
        "jobs": results
    }
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(report_data, f, indent=2, ensure_ascii=False)
    log_info(f"Detailed pipeline report index saved to {summary_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProcess interrupted by user safely. Exiting.")
        sys.exit(0)
