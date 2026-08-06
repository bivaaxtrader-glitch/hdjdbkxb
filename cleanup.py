import sys

with open('src/pages/Affiliate.tsx', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
    
    # Remove the accidentally duplicated insertions
    if 'Source / Sub-ID' in line and i < 1500: # We only want it in the table
        continue
    if 'referralSubId' in line and i < 1500:
        continue
        
    new_lines.append(line)

with open('src/pages/Affiliate.tsx', 'w') as f:
    f.writelines(new_lines)
