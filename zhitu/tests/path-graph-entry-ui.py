"""Record the first visible Canvas frames, not just the settled graph."""

import argparse
import copy
import json
import math
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
RUNS = Path(__file__).parents[1] / ".agent-workflow/tasks/learning-wiki-foundation/runs"
PROBE = """(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const clear = proto.clearRect, arc = proto.arc;
  const canvases = new Set();
  window.__entryFrames = [];
  const sample = () => {
    for (const canvas of canvases) {
      if (canvas.checkVisibility({visibilityProperty:true,opacityProperty:true}) && canvas.__entryFrame) {
        window.__entryFrames.push({...canvas.__entryFrame,time:performance.now()});
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  proto.clearRect = function(...args) {
    this.__entryFrame = null;
    return clear.apply(this,args);
  };
  proto.arc = function(x,y,r,...rest) {
    const canvas=this.canvas, graph=canvas.closest('[data-testid="knowledge-graph"]');
    if (graph) {
      canvases.add(canvas);
      if (!this.__entryFrame) {
        const rect=canvas.getBoundingClientRect(), t=this.getTransform();
        const ratio=canvas.width/rect.width;
        this.__entryFrame={time:performance.now(),k:t.a/ratio,
          cx:(rect.width/2-t.e/ratio)/(t.a/ratio),
          cy:(rect.height/2-t.f/ratio)/(t.d/ratio),nodes:[]};
        canvas.__entryFrame=this.__entryFrame;
      }
      this.__entryFrame.nodes.push({x,y,r});
    }
    return arc.call(this,x,y,r,...rest);
  };
})();"""


def workspace(count):
    return {"revision": 8, "data": {
        "files": [{"id": f"n{i}", "name": f"笔记 {i}", "type": "file", "parentId": None,
                   "order": i, "content": f"[[笔记 {(i+1) % count}]]" if count > 1 else "孤立笔记",
                   "agentPermission": "read", "createdByKind": "user"} for i in range(count)],
        "openTabs": ["n0"], "activeTabId": "n0", "expandedFolderIds": [],
        "activePlan": None, "mentorId": None, "wikiTemplateVersion": 1,
        "wikiInitializedAt": "2026-10-16T00:00:00.000Z",
    }}


parser = argparse.ArgumentParser()
parser.add_argument("--quick", action="store_true", help="Run only the six-note first-entry regression")
args = parser.parse_args()
cases = [("light-six", 6, "default", 1440, False, False)]
if not args.quick:
    cases += [("dark-six", 6, "dark", 1440, False, False),
              ("narrow-forty", 40, "default", 1024, False, False),
              ("single", 1, "default", 1440, False, False),
              ("reduced-motion", 6, "dark", 1440, True, False),
              ("early-wheel", 6, "default", 1440, False, True)]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for name, count, theme, width, reduced, wheel in cases:
            model, errors = workspace(count), []

            def intercept(route):
                endpoint = urlparse(route.request.url).path
                if endpoint.endswith("/growth/workspace"):
                    if route.request.method == "PUT":
                        model["data"] = copy.deepcopy(route.request.post_data_json["data"])
                        model["revision"] += 1
                    route.fulfill(json=model)
                elif endpoint.endswith("/user/info"):
                    route.fulfill(json={"data": {"id": "119", "username": "entry-test", "email": "entry@example.invalid", "avatar": ""}})
                else:
                    route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

            context = browser.new_context(viewport={"width": width, "height": 1000},
                                          device_scale_factor=1.5 if reduced else 1,
                                          reduced_motion="reduce" if reduced else "no-preference")
            context.add_init_script(f"localStorage.setItem('userId','119');localStorage.setItem('token','entry-test');localStorage.setItem('data-theme','{theme}')")
            context.add_init_script(PROBE)
            context.route(f"{BASE_URL}/api/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{BASE_URL}/path", wait_until="networkidle")
            page.evaluate("window.__entryStarted=performance.now()")
            page.get_by_role("button", name="知识图谱", exact=True).click()
            expect(page.get_by_test_id("knowledge-graph")).to_be_visible()
            page.wait_for_function("window.__entryFrames.some(f=>f.nodes.length)", timeout=5000)
            if name == "light-six":
                page.screenshot(path=str(RUNS / "graph-entry-first.png"), full_page=True)
            if wheel:
                page.wait_for_timeout(90)
                box = page.get_by_test_id("knowledge-graph").bounding_box()
                page.mouse.move(box["x"] + box["width"] / 2, box["y"] + 50)
                page.mouse.wheel(0, -120)
            page.wait_for_timeout(1200)
            frames = page.evaluate("window.__entryFrames.filter(f=>f.nodes.length)")
            viewport = page.get_by_test_id("knowledge-graph").bounding_box()
            first_delay = frames[0]["time"] - page.evaluate("window.__entryStarted")
            scales = [frame["k"] for frame in frames]
            summary = {"case": name, "frames": len(frames), "firstFrameMs": round(first_delay),
                       "firstZoom": scales[0], "lastZoom": scales[-1], "zoomRange": max(scales)-min(scales)}
            RUNS.mkdir(parents=True, exist_ok=True)
            (RUNS / f"graph-entry-{name}.json").write_text(json.dumps({"summary": summary, "frames": frames}, ensure_ascii=False), encoding="utf-8")
            print(json.dumps(summary), flush=True)
            assert not errors, errors
            assert first_delay < 1000, f"{name}: graph entrance unnecessarily delayed"
            if wheel:
                assert scales[-1] > scales[0] + 0.05, "Early wheel input was overwritten by a late automatic fit"
                assert all(b >= a - 0.001 for a, b in zip(scales, scales[1:])), "Camera reversed direction after early wheel input"
            else:
                assert max(scales)-min(scales) < 0.001, "First visible graph zoom jumps before settling"
                assert scales[0] <= 1.251, "Library default camera was shown instead of fitting the entrance"
                assert all(math.hypot(frame["cx"]-frames[0]["cx"], frame["cy"]-frames[0]["cy"]) < 0.1 for frame in frames), "First-entry camera unexpectedly pans"
                assert all(abs((node["x"]-frame["cx"])*frame["k"]) + node["r"]*frame["k"] < viewport["width"]/2
                           and abs((node["y"]-frame["cy"])*frame["k"]) + node["r"]*frame["k"] < viewport["height"]/2
                           for frame in frames for node in frame["nodes"]), "Entrance settling moved a node outside the viewport"
                movement = max(math.hypot(node["x"]-frames[0]["nodes"][i]["x"], node["y"]-frames[0]["nodes"][i]["y"])
                               for frame in frames if len(frame["nodes"]) == count for i, node in enumerate(frame["nodes"]))
                print(f"{name}: maximum node settling distance={movement:.3f} world px", flush=True)
                if reduced:
                    assert movement < 0.1, "Reduced-motion entrance still animates the node layout"
                elif count > 1:
                    assert movement > 0.1, "Normal entrance lost the node-settling animation"
                if name == "light-six":
                    page.screenshot(path=str(RUNS / "graph-entry-settled.png"), full_page=True)
                # Reopening the existing graph tab must not replay an entrance or refit.
                page.get_by_role("tab", name="笔记 0", exact=True).click()
                page.get_by_role("button", name="知识图谱", exact=True).click()
                page.wait_for_timeout(250)
                final_k = page.evaluate("window.__entryFrames.at(-1).k")
                assert abs(final_k-scales[-1]) < 0.001, "Reopening the graph refitted its camera"
            context.close()
    finally:
        browser.close()
print("PASS: first visible camera, node entrance, reduced motion and early user input")
