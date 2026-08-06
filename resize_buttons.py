
file_path = 'src/pages/TradeTerminal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Resize buttons:
# Find the specific block for the up/down buttons
import re

# Use regex to find the button structure and update classes
# The button class string: `flex-1 h-[86px] rounded-[22px] flex items-center justify-center transition-all relative shadow-lg`
# Icon size: `size={44}`

pattern = r'(flex-1 h-\[86px\] rounded-\[22px\] flex items-center justify-center transition-all relative shadow-lg)'
replacement = 'flex-1 h-[60px] rounded-[16px] flex items-center justify-center transition-all relative shadow-lg'

content = re.sub(pattern, replacement, content)

# Change icon size
icon_pattern = r'size=\{44\}'
replacement_icon = 'size={32}'
content = re.sub(icon_pattern, replacement_icon, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Successfully resized buttons.")
