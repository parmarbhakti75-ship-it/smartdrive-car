import os

folder = r"C:\Users\ASUS\.gemini\antigravity-ide\scratch\smartdrive-robot"
html_path = os.path.join(folder, "index.html")
css_path = os.path.join(folder, "style.css")
ard_path = os.path.join(folder, "arduino_source.js")
sim_path = os.path.join(folder, "simulator.js")
fw_path = os.path.join(folder, "firmware_sim.js")
app_path = os.path.join(folder, "app.js")
out_path = os.path.join(folder, "smartdrive_portable.html")

with open(html_path, "r", encoding="utf-8") as f:
    html = f.read()

with open(css_path, "r", encoding="utf-8") as f:
    css = f.read()

with open(ard_path, "r", encoding="utf-8") as f:
    ard = f.read()

with open(sim_path, "r", encoding="utf-8") as f:
    sim = f.read()

with open(fw_path, "r", encoding="utf-8") as f:
    fw = f.read()

with open(app_path, "r", encoding="utf-8") as f:
    app = f.read()

# Replace css link with inline style
html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")

# Replace scripts
script_block = """  <!-- Audio synthesizers, physics simulator & UI scripts -->
  <script src="arduino_source.js"></script>
  <script src="simulator.js"></script>
  <script src="firmware_sim.js"></script>
  <script src="app.js"></script>"""

inline_js = f"<script>\n{ard}\n{sim}\n{fw}\n{app}\n</script>"
if script_block in html:
    html = html.replace(script_block, inline_js)
else:
    # Fallback replace
    html = html.replace('<script src="app.js"></script>', f"{inline_js}")

with open(out_path, "w", encoding="utf-8") as f:
    f.write(html)

print(f"SUCCESS: Created standalone smartdrive_portable.html ({len(html)} bytes)")
