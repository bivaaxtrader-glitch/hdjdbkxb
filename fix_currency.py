import sys

file_path = 'src/pages/TradeTerminal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_content = [
    '                              {currencies.slice(0, 3).map((c) => (\n',
    '                                 <button\n',
    '                                    key={c.code}\n',
    '                                    onClick={async () => {\n',
    '                                       const oldCurrency = currencies.find(curr => curr.code === userCurrency) || currencies[0];\n',
    '                                       const newCurrency = c;\n',
    '                                       setAmount(prev => Math.floor((prev / oldCurrency.rate) * newCurrency.rate));\n',
    '                                       setDepositAmount(prev => {\n',
    '                                          const val = parseFloat(prev);\n',
    '                                          if (isNaN(val)) return prev;\n',
    '                                          return Math.floor((val / oldCurrency.rate) * newCurrency.rate).toString();\n',
    '                                       });\n',
    '                                       setUserCurrency(c.code);\n',
    '                                       if (currentUser) {\n',
    '                                          try {\n',
    '                                            await updateDoc(doc(db, "users", currentUser.uid), {\n',
    '                                               currency: c.code\n',
    '                                            });\n',
    '                                            toast.success(`Currency changed to ${c.code}`);\n',
    '                                          } catch (e) {\n',
    '                                            console.error("Failed to update currency:", e);\n',
    '                                            toast.error("Failed to save currency setting");\n',
    '                                          }\n',
    '                                       }\n',
    '                                    }}\n',
    '                                    className={`flex-1 py-4 rounded-xl font-bold text-lg transition-all border ${userCurrency === c.code ? "bg-[#00C980] border-[#00C980] text-white shadow-lg" : "bg-[#2A2B31] border-[#3b3b3f] text-gray-400 hover:text-white"}`}\n',
    '                                 >\n',
    '                                    {c.symbol} {c.code}\n',
    '                                 </button>\n',
    '                              ))}\n'
]

# lines are 0-indexed in python, so line 9557 is index 9556
# we replace lines 9557 to 9586 (indices 9556 to 9585)
lines[9556:9586] = new_content

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)
