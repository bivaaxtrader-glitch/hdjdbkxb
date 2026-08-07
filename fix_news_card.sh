sed -i '8411,8431c\
                        className="bg-[#2C2C2E] hover:bg-[#3A3A3C] rounded-2xl p-5 border border-transparent transition-all cursor-pointer flex flex-col gap-3 active:scale-[0.98] group relative"\
                        id={`platform-news-card-${news.id || idx}`}\
                      >\
                        <div className="flex justify-between items-center">\
                          <p className="text-[#8C8F96] text-[13px] font-medium">{news.date}</p>\
                          {idx !== 0 && <span className="w-2 h-2 rounded-full bg-[#FFE24C]"></span>}\
                        </div>\
                        <h4 className="text-[17px] font-bold leading-snug text-white group-hover:text-[#ffe24c] transition-colors">\
                          {news.title} {news.emoji}\
                        </h4>\
                        <p className="text-[#8C8F96] text-[14px] line-clamp-3 leading-relaxed">\
                          {news.description}\
                        </p>\
                        <div className="flex items-center gap-2 pt-1">\
                           <span className="text-[#8C8F96]"><Icons.Smile size={18} /></span>\
                           <span className="text-[#8C8F96] text-[14px] font-bold">{news.reactions || 75}</span>\
                        </div>\
' src/pages/TradeTerminal.tsx
