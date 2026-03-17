import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

app.post("/translate", async (req,res)=>{
  const {texts, source, target} = req.body;

  const prompt = `
Translate from ${source} to ${target}.

Rules:
- Natural meaning (not literal)
- Detect slang
- Add short tone
- Multiple meanings if needed

Texts:
${texts.map((t,i)=>`${i+1}. ${t}`).join("\n")}
`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method:"POST",
    headers:{
      "Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      model:"gpt-5.3",
      messages:[{role:"user",content:prompt}],
      temperature:0.3
    })
  });

  const data = await r.json();

  const output = data.choices[0].message.content
    .split("\n\n")
    .map(x=>({translation:x, tone:""}));

  res.json(output);
});

app.listen(3000);