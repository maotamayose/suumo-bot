import axios from 'axios';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config'; 

// ================= 設定エリア =================
const TARGET_URL = "http://suumo.jp/jj/chintai/ichiran/FR301FC001/?ar=030&bs=040&ra=013&rn=0015&rn=0070&ek=001528860&ek=001527320&ek=001527360&ek=007050010&ek=007026200&ek=007028870&ek=007027320&cb=0.0&ct=15.0&mb=30&mt=9999999&md=01&ts=1&et=9999999&cn=9999999&co=1&shkr1=03&shkr2=03&shkr3=03&shkr4=03&sngz=&po1=09";

const LINE_ACCESS_TOKEN = process.env.LINE_ACCESS_TOKEN || "";
const LINE_USER_ID = process.env.LINE_USER_ID || "";
const HISTORY_FILE = path.join(__dirname, 'sent_list.txt');
// ============================================

const getSentList = (): string[] => {
    if (!fs.existsSync(HISTORY_FILE)) {
        return [];
    }
    return fs.readFileSync(HISTORY_FILE, 'utf-8').split('\n').filter(Boolean);
};

const saveSentList = (urls: string[]) => {
    const data = urls.join('\n') + '\n';
    fs.appendFileSync(HISTORY_FILE, data);
};

// LINE Messaging API で送信 (グループ指定のPush通知)
const sendLineMessage = async (text: string) => {
    // ★修正: broadcast から push に戻す
    const url = "https://api.line.me/v2/bot/message/push";
    
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_ACCESS_TOKEN}`
    };
    
    // ★修正: 宛先(to)を指定する
    const body = {
        to: LINE_USER_ID,
        messages: [{ type: "text", text: text }]
    };

    try {
        await axios.post(url, body, { headers });
        console.log("✅ グループへの送信成功！");
    } catch (error: any) {
        console.error("❌ LINE送信エラー:", error.response?.data || error.message);
    }
};

const main = async () => {
    try {
        console.log("🔍 SUUMOからデータを取得中...");
        
        const SECURE_URL = TARGET_URL.replace("http://", "https://");
        const response = await axios.get(SECURE_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://suumo.jp/'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const items = $(".cassetteitem");
        
        console.log(`🏢 取得した建物数: ${items.length}件`);

        const sentUrls = getSentList();
        const newUrlsToSave: string[] = [];
        const notifyMessages: string[] = [];

        items.each((_, element) => {
            // 建物の共通情報
            const buildingName = $(element).find(".cassetteitem_content-title").text().trim();
            const station = $(element).find(".cassetteitem_detail-col1").text().trim();
            const age = $(element).find(".cassetteitem_detail-col3").text().trim();
            
            // 部屋ごとのリスト
            const tbodies = $(element).find("table.cassetteitem_other tbody");

            tbodies.each((_, tbody) => {
                const linkTag = $(tbody).find("a.js-cassette_link_href");
                
                if (linkTag.length > 0) {
                    const href = linkTag.attr("href");
                    if (!href || href.includes("javascript") || href === "") return;

                    const link = `https://suumo.jp${href}`;

                    if (sentUrls.includes(link) || newUrlsToSave.includes(link)) {
                        return;
                    }

                    // === 詳細情報の取得 ===
                    const rent = $(tbody).find(".cassetteitem_price--rent").text().trim();
                    const admin = $(tbody).find(".cassetteitem_price--administration").text().trim();
                    const deposit = $(tbody).find(".cassetteitem_price--deposit").text().trim();
                    const gratuity = $(tbody).find(".cassetteitem_price--gratuity").text().trim();
                    const madori = $(tbody).find(".cassetteitem_madori").text().trim();
                    const menseki = $(tbody).find(".cassetteitem_menseki").text().trim();
                    const floor = $(tbody).find("td:nth-child(3)").text().trim(); 

                    // メッセージの組み立て
                    const msg = `🏠 ${buildingName} (${age})\n` +
                                `家賃: ${rent} (管 ${admin})\n` +
                                `敷礼: ${deposit} / ${gratuity}\n` +
                                `間取: ${madori} / ${menseki} (${floor})\n` +
                                `最寄: ${station}\n` +
                                `${link}`;

                    notifyMessages.push(msg);
                    newUrlsToSave.push(link);
                }
            });
        });

        console.log(`📬 新着物件: ${notifyMessages.length}件`);

        if (notifyMessages.length > 0) {
            const header = `【新着物件 ${notifyMessages.length}件】\n\n`;
            let fullMessage = header + notifyMessages.join("\n" + "-".repeat(15) + "\n");

            if (fullMessage.length > 2000) {
                fullMessage = fullMessage.substring(0, 2000) + "\n...(文字数制限のため省略)";
            }

            await sendLineMessage(fullMessage);
            saveSentList(newUrlsToSave);
        } else {
            console.log("💤 新着物件はありませんでした。");
        }

    } catch (error) {
        console.error("🚨 エラーが発生しました:", error);
    }
};

main();
