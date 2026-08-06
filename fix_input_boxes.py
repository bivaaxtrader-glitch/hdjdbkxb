
file_path = 'src/pages/TradeTerminal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Using regex to target the specific class string to avoid issues with different element attributes
import re

old_class = 'bg-[#2d2f36] rounded-[22px] p-2 flex flex-col items-center justify-center relative group border border-white/5 hover:border-white/10 transition-all shadow-inner h-[80px]'
new_class = 'bg-[#2d2f36] rounded-[14px] p-1 flex flex-col items-center justify-center relative group border border-white/5 hover:border-white/10 transition-all shadow-inner h-[60px]'

# For the second one, it also has 'cursor-pointer' at the end of class string
old_class_time = 'bg-[#2d2f36] rounded-[22px] p-2 flex flex-col items-center justify-center relative group border border-white/5 hover:border-white/10 transition-all shadow-inner h-[80px] cursor-pointer'
new_class_time = 'bg-[#2d2f36] rounded-[14px] p-1 flex flex-col items-center justify-center relative group border border-white/5 hover:border-white/10 transition-all shadow-inner h-[60px] cursor-pointer'

new_content = content.replace(old_class_time, new_class_time)
new_content = new_content.replace(old_class, new_class)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Successfully updated input box classes.")
