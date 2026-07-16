/**
 * POST /api/voice-dna/recommend-creators
 * Path B2:推荐对标博主
 */

import { NextRequest, NextResponse } from'next/server';
import { getCurrentUser } from'@/lib/auth';
import { deepseek } from'@/lib/llm';
import { runTool } from'@/lib/tools';

type Body = {
 direction:'saas'|'ai'|'tools'|'content_creation';
 style:'casual'|'professional'|'humorous';
 language?:'en'|'zh';
};

export async function POST(req: NextRequest) {
 const user = await getCurrentUser();
 if (!user) return NextResponse.json({ error:'unauthorized'}, { status: 401 });

 const body = (await req.json().catch(() => ({}))) as Body;
 if (!body.direction || !body.style) {
 return NextResponse.json({ error:'direction and style required'}, { status: 400 });
 }

 const lang = body.language ||'en';
 const query =
 `中文 X 上受欢迎的 ${directionToZh(body.direction)} 方向博主,${body.style} 风格`;

 let candidates: Array<{ handle: string; reason: string }> = [];

 try {
 const result = await runTool('web_search', { query, count: 10 }, { userId: user.id });
 if (result.ok && result.data) {
 const data = result.data as { results?: Array<{ title?: string; url?: string; snippet?: string }> };
 const raw = (data.results ?? [])
 .map((r) => `${r.title ??''}\n${r.url ??''}\n${r.snippet ??''}`)
 .join('\n\n');

 // Use LLM to extract handles + reason from search results
 const resp = await deepseek.chat.completions.create({
 model:'deepseek-v4-flash',
 messages: [
 {
 role:'system',
 content:'从以下 web 搜索结果里提取 5 个 X/Twitter handle,每个附 1 句 reason。仅返回 JSON: {"handles": [{"handle":"@x","reason":"..."}]}',
 },
 { role:'user', content: raw.slice(0, 4000) },
 ],
 temperature: 0.3,
 max_tokens: 800,
 });
 const text = resp.choices[0]?.message?.content ??'';
 const json = text.replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim();
 try {
 const parsed = JSON.parse(json);
 if (Array.isArray(parsed.handles)) {
 candidates = parsed.handles.slice(0, 5);
 }
 } catch {
 // fallback: try regex
 const re = /@(\w{2,20})/g;
 const seen = new Set<string>();
 let m;
 while ((m = re.exec(raw)) !== null && candidates.length < 5) {
 const h ='@'+ m[1];
 if (!seen.has(h)) {
 seen.add(h);
 candidates.push({ handle: h, reason:'在搜索结果中被多次提到'});
 }
 }
 }
 }
 } catch (e) {
 console.warn('[recommend-creators] web search failed:', e);
 }

 return NextResponse.json({ recommendations: candidates });
}

function directionToZh(d: string): string {
 const map: Record<string, string> = {
 saas:'独立开发 / SaaS',
 ai:'AI / 人工智能',
 tools:'开发者工具',
 content_creation:'内容创作',
 };
 return map[d] ?? d;
}
