
file_path = 'src/pages/TradeTerminal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Deposit button
old_deposit_class = 'className="bg-[#ffe24c] hover:bg-[#fff080] text-[#131417] h-[44px] px-5 rounded-[12px] font-black text-[15px] flex items-center gap-2.5 transition-all active:scale-95 shadow-lg"'
new_deposit_class = 'className="bg-[#ffe24c] hover:bg-[#fff080] text-[#131417] h-[36px] px-4 rounded-[10px] font-black text-[13px] flex items-center gap-2 transition-all active:scale-95 shadow-lg"'

# Withdraw button
old_withdraw_class = 'className="bg-[#2a2c31] hover:bg-[#32343a] text-white h-[44px] px-5 rounded-[12px] font-black text-[15px] flex items-center gap-2.5 transition-all active:scale-95 border border-white/5"'
new_withdraw_class = 'className="bg-[#2a2c31] hover:bg-[#32343a] text-white h-[36px] px-4 rounded-[10px] font-black text-[13px] flex items-center gap-2 transition-all active:scale-95 border border-white/5"'

new_content = content.replace(old_deposit_class, new_deposit_class)
new_content = new_content.replace(old_withdraw_class, new_withdraw_class)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Successfully updated buttons.")
