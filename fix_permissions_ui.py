import sys

file_path = 'src/pages/AdminDashboard.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

old_block = """                                                            {permKey === 'canManageUsers' ? 'Database Access & Identifier Control' :
                                                             permKey === 'canManageStaff' ? 'Identity Management & Clearance' :
                                                             permKey === 'canManageFinance' ? 'Ledger Processing & Handshakes' :
                                                             permKey === 'canManageContent' ? 'Kernel Announcements & News' :
                                                             permKey === 'canManageMarkets' ? 'Direct Algorithmic Manipulation' :
                                                             'System Integrity & Config Override'}"""

new_block = """                                                            {permKey === 'canManageUsers' ? 'Database Access & Identifier Control' :
                                                             permKey === 'canManageStaff' ? 'Identity Management & Clearance' :
                                                             permKey === 'canManageFinance' ? 'Ledger Processing & Handshakes' :
                                                             permKey === 'canManageContent' ? 'Kernel Announcements & News' :
                                                             permKey === 'canManageMarkets' ? 'Direct Algorithmic Manipulation' :
                                                             permKey === 'canManageSystem' ? 'System Integrity & Config Override' :
                                                             permKey === 'canManageDeposits' ? 'Inbound Liquidity Authorization' :
                                                             permKey === 'canManageWithdrawals' ? 'Outbound Capital Clearance' :
                                                             permKey === 'canManageKYC' ? 'Identity Verification & Compliance' :
                                                             'Client Support & Ticket Handling'}"""

if old_block in content:
    new_content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Successfully updated permission descriptions.")
else:
    # Try searching without leading spaces if it fails
    import re
    pattern = r"\{permKey === 'canManageUsers' \? 'Database Access & Identifier Control' :.*? 'System Integrity & Config Override'\}"
    if re.search(pattern, content, re.DOTALL):
        new_content = re.sub(pattern, new_block.strip(), content, flags=re.DOTALL)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("Successfully updated permission descriptions using regex.")
    else:
        print("Could not find the target block.")
        sys.exit(1)
