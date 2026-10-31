"""Exercise real Canvas drawing and control geometry with an isolated workspace."""

import copy
import math
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


sys.stdout.reconfigure(encoding="utf-8")
BASE_URL = os.environ.get("PATH_UI_BASE_URL", "http://127.0.0.1:5175")
RUNS = Path(__file__).parents[1] / ".agent-workflow/tasks/learning-wiki-foundation/runs"
RUNS.mkdir(parents=True, exist_ok=True)
CONTENTS = {
    "A": "[[B 笔记]]\n\n[[B 笔记]]\n\n[[B 笔记]]",
    "B": "[[A 笔记]]\n\n[[D 笔记]]",
    "C": "[[B 笔记]]\n\n[[C 笔记]]\n\n[[不存在]]",
    "D": "[[E 笔记]]",
    "E": "普通笔记",
    "U": "孤立笔记",
}
INITIAL = {
    "revision": 8,
    "data": {
        "files": [
            {"id": "notes", "name": "测试笔记", "type": "folder", "parentId": None,
             "order": 0, "agentPermission": "read", "createdByKind": "user"},
            *[{"id": key, "name": f"{key} 笔记", "type": "file", "parentId": "notes",
               "order": index, "content": content, "agentPermission": "read", "createdByKind": "user"}
              for index, (key, content) in enumerate(CONTENTS.items())],
        ],
        "openTabs": ["A"], "activeTabId": "A", "expandedFolderIds": ["notes"],
        "activePlan": None, "mentorId": None, "wikiTemplateVersion": 1,
        "wikiInitializedAt": "2026-10-15T00:00:00.000Z",
    },
}

# Observe the actual paint calls. Nothing is exposed by production components.
CANVAS_PROBE = """(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const relevant = ctx => ctx.canvas.closest('[data-testid="knowledge-graph"]');
  const screen = (ctx, x, y) => {
    const box = ctx.canvas.getBoundingClientRect(), t = ctx.getTransform();
    const sx = ctx.canvas.width / box.width, sy = ctx.canvas.height / box.height;
    return {x: box.x + (t.a*x+t.c*y+t.e)/sx,
      y: box.y + (t.b*x+t.d*y+t.f)/sy, k: t.a/sx};
  };
  const wrap = (name, probe) => {
    const original = proto[name];
    proto[name] = function(...args) { if (relevant(this)) probe(this, args); return original.apply(this,args); };
  };
  wrap('clearRect', ctx => {
    window.__graphPaintCount = (window.__graphPaintCount ?? 0) + 1;
    if (window.__graphCapture && window.__graphPaint?.nodes.length) {
      (window.__graphHistory ??= []).push(window.__graphPaint);
      if (window.__graphHistory.length>100) window.__graphHistory.shift();
    }
    window.__graphPaint = {nodes:[], links:[], labels:[]}; ctx.__probeArc = null;
  });
  wrap('beginPath', ctx => { ctx.__probeArc = null; ctx.__probeLine = []; });
  wrap('arc', (ctx,[x,y,r]) => { ctx.__probeArc = {x,y,r}; });
  wrap('moveTo', (ctx,[x,y]) => { ctx.__probeLine = [{x,y}]; });
  wrap('lineTo', (ctx,[x,y]) => { (ctx.__probeLine ??= []).push({x,y}); });
  wrap('fill', ctx => {
    if (!ctx.__probeArc || !window.__graphPaint) return;
    const {x,y,r} = ctx.__probeArc, point = screen(ctx,x,y);
    const node = {...point, wx:x, wy:y, radius:r*point.k, worldRadius:r,
      color:ctx.fillStyle, alpha:ctx.globalAlpha};
    window.__graphPaint.nodes.push(node); ctx.__probeNode = node;
  });
  wrap('fillText', (ctx,[text,x,y]) => {
    if (!window.__graphPaint) return;
    const point = screen(ctx,x,y), metrics=ctx.measureText(text);
    const label = {...point,text,color:ctx.fillStyle,alpha:ctx.globalAlpha,
      top:point.y-metrics.actualBoundingBoxAscent*point.k,font:ctx.font};
    window.__graphPaint.labels.push(label);
    if (ctx.__probeNode && Math.abs(ctx.__probeNode.wx-x)<0.001) ctx.__probeNode.label = label;
  });
  wrap('stroke', ctx => {
    if (!window.__graphPaint || ctx.__probeLine?.length!==2) return;
    const a=screen(ctx,ctx.__probeLine[0].x,ctx.__probeLine[0].y);
    const b=screen(ctx,ctx.__probeLine[1].x,ctx.__probeLine[1].y);
    window.__graphPaint.links.push({a,b,color:ctx.strokeStyle,width:ctx.lineWidth*a.k,alpha:ctx.globalAlpha});
  });
})();"""


def snapshot(page):
    return page.evaluate("JSON.parse(JSON.stringify(window.__graphPaint))")


def nodes_by_name(paint):
    return {node["label"]["text"][0]: node for node in paint["nodes"] if node.get("label")}


def hover_node(page, name):
    point = nodes_by_name(snapshot(page))[name]
    page.mouse.move(point["x"], point["y"])
    page.wait_for_timeout(180)
    return nodes_by_name(snapshot(page))


failures = []


def check(condition, description):
    if not condition:
        failures.append(description)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    try:
        for theme in ("default", "dark"):
            errors, writes = [], []
            model = copy.deepcopy(INITIAL)

            def intercept(route):
                request, endpoint = route.request, urlparse(route.request.url).path
                if endpoint.endswith("/growth/workspace"):
                    if request.method == "PUT":
                        model["data"] = copy.deepcopy(request.post_data_json["data"])
                        model["revision"] += 1
                        writes.append(copy.deepcopy(request.post_data_json))
                    route.fulfill(json=copy.deepcopy(model))
                elif endpoint.endswith("/user/info"):
                    route.fulfill(json={"data": {"id": "109", "username": "graph-test", "email": "graph@example.invalid", "avatar": ""}, "message": "ok"})
                else:
                    route.fulfill(json={"data": [], "list": [], "total": 0, "message": "ok"})

            context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
            context.add_init_script(f"localStorage.setItem('userId','109');localStorage.setItem('token','graph-test');localStorage.setItem('data-theme','{theme}')")
            context.add_init_script(CANVAS_PROBE)
            context.route(f"{BASE_URL}/api/**", intercept)
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto(f"{BASE_URL}/path")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name="知识图谱", exact=True).click()
            graph = page.get_by_test_id("knowledge-graph")
            expect(graph).to_be_visible()
            expect(graph).to_have_attribute("data-link-count", "5")
            page.wait_for_timeout(4300)

            controls = page.get_by_label("知识图谱缩放", exact=True)
            geometry = controls.evaluate("""el => {
              const box=el.getBoundingClientRect(), cs=getComputedStyle(el);
              return {width:box.width,height:box.height,padding:[cs.paddingTop,cs.paddingRight,cs.paddingBottom,cs.paddingLeft],
                buttons:[...el.querySelectorAll('button')].map(btn=>{
                  const b=btn.getBoundingClientRect(),s=btn.querySelector('svg').getBoundingClientRect();
                  return {width:b.width,height:b.height,svgWidth:s.width,svgHeight:s.height,
                    offsetX:s.x+s.width/2-b.x-b.width/2,offsetY:s.y+s.height/2-b.y-b.height/2};
                })};
            }""")
            check(abs(geometry["width"]-166)<0.6 and abs(geometry["height"]-42)<0.6, f"{theme}: control group box {geometry}")
            check(geometry["padding"] == ["4px"]*4, f"{theme}: symmetric control padding")
            for index, button in enumerate(geometry["buttons"]):
                check(button["width"] == 32 and button["height"] == 32, f"{theme}: button {index} hit size {button}")
                check(button["svgWidth"] == 16 and button["svgHeight"] == 16 and abs(button["offsetX"])<0.6 and abs(button["offsetY"])<0.6,
                      f"{theme}: button {index} SVG not centered {button}")

            rest_paint = snapshot(page)
            rest = nodes_by_name(rest_paint)
            check(set(rest) == set(CONTENTS), f"{theme}: expected visible fixture labels, got {list(rest)}")
            expected_counts = {"A": 1, "B": 2, "C": 0, "D": 1, "E": 1, "U": 0}
            for name, count in expected_counts.items():
                node = rest[name]
                expected_radius = min(10,4+1.5*math.log2(1+count))
                check(abs(node["worldRadius"]-expected_radius)<0.01, f"{theme}: {name} radius must count incoming distinct sources, got {node['worldRadius']}")
                gap = node["label"]["top"]-node["y"]-node["radius"]
                check(abs(gap-6)<=1, f"{theme}: {name} resting label gap={gap:.2f}")

            page.evaluate("window.__graphCapture=true;window.__graphHistory=[]")
            hovered = hover_node(page,"B")
            page.evaluate("window.__graphCapture=false")
            hover_frames = page.evaluate("window.__graphHistory")
            intermediate_colors = {nodes_by_name(frame)["B"]["color"] for frame in hover_frames if "B" in nodes_by_name(frame)}
            check(len(intermediate_colors)>2, f"{theme}: hover jumped directly to final color")
            check(all(abs(edge["width"]-1)<0.01 for frame in hover_frames for edge in frame["links"]), f"{theme}: link width changed during transition")
            for name in ("A", "C", "D"):
                check(hovered[name]["color"] == rest[name]["color"] and hovered[name]["alpha"] == rest[name]["alpha"], f"{theme}: neighbor {name} lost original color/opacity")
                check(hovered[name]["label"]["color"] == rest[name]["label"]["color"], f"{theme}: neighbor {name} label changed color")
            for name in ("E", "U"):
                check(hovered[name]["color"] != rest[name]["color"] and hovered[name]["alpha"] >= 0.4, f"{theme}: unrelated {name} must be softly masked, not erased")
                check(hovered[name]["label"]["color"] != rest[name]["label"]["color"], f"{theme}: unrelated label {name} not masked")
            check(hovered["B"]["color"] != rest["B"]["color"], f"{theme}: hovered node must highlight")
            gap = hovered["B"]["label"]["top"]-hovered["B"]["y"]-hovered["B"]["radius"]
            check(abs(gap-9)<=1, f"{theme}: hovered gap must be 9px, got {gap:.2f}")
            check(abs(hovered["B"]["label"]["y"]-rest["B"]["label"]["y"]-4)<=1, f"{theme}: hovered label must move 4px")
            for edge in snapshot(page)["links"]:
                check(abs(edge["width"]-1)<0.01, f"{theme}: hover changed link width to {edge['width']:.2f}")
            paint_count = page.evaluate("window.__graphPaintCount")
            page.wait_for_timeout(220)
            check(page.evaluate("window.__graphPaintCount") == paint_count, f"{theme}: idle hover kept redrawing after transition completed")
            page.screenshot(path=str(RUNS/f"graph-v07-{theme}-hover.png"), full_page=True)

            # A dimmed node must remain hit-testable; leaving restores all colors.
            isolated = hover_node(page,"U")
            check(isolated["U"]["color"] == hovered["B"]["color"], f"{theme}: dimmed node could not take hover")
            page.mouse.move(20,200)
            page.wait_for_timeout(180)
            recovered = nodes_by_name(snapshot(page))
            check(all(recovered[name]["color"] == rest[name]["color"] for name in rest), f"{theme}: colors did not restore on leave")
            zoom_before = page.get_by_test_id("graph-zoom-label").inner_text()
            page.get_by_role("button",name="Agent 权限",exact=True).click()
            page.wait_for_timeout(220)
            check(page.get_by_test_id("graph-zoom-label").inner_text() == zoom_before, f"{theme}: panel switch disturbed camera")
            for _ in range(3):
                hover_node(page,"B")
                hover_node(page,"U")
            page.mouse.move(20,200)
            page.wait_for_timeout(180)
            # Camera zoom is smoothly interpolated around the pointer, with no tween queue.
            graph_box = graph.bounding_box()
            pointer = {"x":graph_box["x"]+graph_box["width"]-100,"y":graph_box["y"]+90}
            page.mouse.move(pointer["x"],pointer["y"])
            before_zoom = snapshot(page)["nodes"][0]
            anchor_before = (before_zoom["wx"]+(pointer["x"]-before_zoom["x"])/before_zoom["k"],
                             before_zoom["wy"]+(pointer["y"]-before_zoom["y"])/before_zoom["k"])
            page.evaluate("window.__graphCapture=true;window.__graphHistory=[]")
            page.mouse.wheel(0,-120)
            page.wait_for_timeout(180)
            page.evaluate("window.__graphCapture=false")
            after_zoom = snapshot(page)["nodes"][0]
            zoom_frames = page.evaluate("window.__graphHistory")
            scales = [frame["nodes"][0]["k"] for frame in zoom_frames if frame["nodes"]]
            check(len({round(k,4) for k in scales})>2, f"{theme}: wheel zoom was instantaneous")
            check(all(a<=b+0.0001 for a,b in zip(scales,scales[1:])), f"{theme}: wheel zoom overshot or reversed: {scales}")
            anchor_after = (after_zoom["wx"]+(pointer["x"]-after_zoom["x"])/after_zoom["k"],
                            after_zoom["wy"]+(pointer["y"]-after_zoom["y"])/after_zoom["k"])
            check(all(abs(a-b)<0.1 for a,b in zip(anchor_before,anchor_after)), f"{theme}: wheel zoom moved the pointer anchor")
            check(all(abs(edge["width"]-1)<0.01 for frame in zoom_frames for edge in frame["links"]), f"{theme}: zoom changed screen link width")
            for _ in range(12):
                plus = page.get_by_role("button",name="放大知识图谱",exact=True)
                if plus.is_disabled(): break
                plus.click()
                page.wait_for_timeout(180)
            check(page.get_by_test_id("graph-zoom-label").inner_text()=="400%", f"{theme}: maximum zoom bound")
            for _ in range(22):
                minus = page.get_by_role("button",name="缩小知识图谱",exact=True)
                if minus.is_disabled(): break
                minus.click()
                page.wait_for_timeout(180)
            check(page.get_by_test_id("graph-zoom-label").inner_text()=="20%", f"{theme}: minimum zoom bound")
            page.get_by_role("button",name="恢复知识图谱中心",exact=True).click()
            page.wait_for_timeout(280)
            check(page.get_by_test_id("graph-zoom-label").inner_text()=="125%", f"{theme}: restore center bound")
            # Theme changes and visibility events may repaint, but must not touch the camera.
            before_visibility = nodes_by_name(snapshot(page))
            page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
            page.wait_for_timeout(200)
            check(all(abs(nodes_by_name(snapshot(page))[name]["x"]-node["x"])<0.01 for name,node in before_visibility.items()), f"{theme}: visibility event moved camera")
            check(errors == [], f"{theme}: browser errors {errors}")
            print(f"{theme}: observed {len(rest)} nodes and {len(rest_paint['links'])} links; geometry={geometry}")
            context.close()

        for variant, options in (
            ("touch", {"viewport":{"width":1024,"height":768},"has_touch":True}),
            ("reduced-motion-dpr15", {"viewport":{"width":1024,"height":768},"device_scale_factor":1.5,"reduced_motion":"reduce"}),
        ):
            model = copy.deepcopy(INITIAL)
            context = browser.new_context(**options)
            context.add_init_script("localStorage.setItem('userId','109');localStorage.setItem('token','graph-test');localStorage.setItem('data-theme','dark')")
            context.add_init_script(CANVAS_PROBE)
            context.route(f"{BASE_URL}/api/**",intercept)
            page = context.new_page()
            page.goto(f"{BASE_URL}/path")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button",name="知识图谱",exact=True).click()
            page.wait_for_timeout(4300)
            group = page.get_by_label("知识图谱缩放",exact=True)
            box = group.bounding_box()
            expected_size = (202,54) if variant=="touch" else (166,42)
            check(abs(box["width"]-expected_size[0])<0.6 and abs(box["height"]-expected_size[1])<0.6, f"{variant}: incorrect control size {box}")
            rest = nodes_by_name(snapshot(page))
            hovered = hover_node(page,"B")
            check(hovered["B"]["color"] != rest["B"]["color"], f"{variant}: hover not drawn")
            check(hovered["A"]["color"] == rest["A"]["color"], f"{variant}: adjacent color changed")
            gap = hovered["B"]["label"]["top"]-hovered["B"]["y"]-hovered["B"]["radius"]
            check(abs(gap-9)<1,f"{variant}: label gap={gap}")
            check(all(abs(edge["width"]-1)<0.02 for edge in snapshot(page)["links"]),f"{variant}: screen line width changed")
            page.screenshot(path=str(RUNS/f"graph-v07-{variant}.png"),full_page=True)
            print(f"{variant}: controls={expected_size}, hover/spacing/line width checked")
            context.close()
    finally:
        browser.close()

if failures:
    raise AssertionError("\n".join(failures))
print("path graph Canvas and control checks passed")
