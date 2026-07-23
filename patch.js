const fs = require('fs');
let css = fs.readFileSync('frontend/styles.css', 'utf8');

css = css.replace(':root {', `:root {\n  --bg-rgb: 8, 13, 24;\n  --panel-rgb: 16, 24, 39;\n  --text-rgb: 255, 255, 255;\n  --shadow-rgb: 0, 0, 0;\n  --bg-solid: #080d18;`);

css = css.replace(/rgba\(8,\s*13,\s*24,/g, 'rgba(var(--bg-rgb),');
css = css.replace(/rgba\(16,\s*24,\s*39,/g, 'rgba(var(--panel-rgb),');
css = css.replace(/rgba\(255,\s*255,\s*255,/g, 'rgba(var(--text-rgb),');
css = css.replace(/rgba\(0,\s*0,\s*0,/g, 'rgba(var(--shadow-rgb),');
css = css.replace(/#080d18/g, 'var(--bg-solid)');
css = css.replace(/#101827/g, 'var(--panel)');
css = css.replace(/#0b1020/g, 'var(--ink)');
css = css.replace(/#0c1220/g, 'var(--panel)');
css = css.replace(/#18273d/g, 'var(--panel-2)');
css = css.replace(/#08111f/g, 'var(--ink)');

css += `\n[data-theme='light'] {\n  --ink: #ffffff;\n  --panel: #f8fafc;\n  --panel-2: #f1f5f9;\n  --line: #cbd5e1;\n  --muted: #64748b;\n  --text: #0f172a;\n  --soft: #334155;\n  --white: #ffffff;\n  --bg-rgb: 248, 250, 252;\n  --panel-rgb: 255, 255, 255;\n  --text-rgb: 15, 23, 42;\n  --shadow-rgb: 148, 163, 184;\n  --bg-solid: #f8fafc;\n}\n`;

fs.writeFileSync('frontend/styles.css', css);
