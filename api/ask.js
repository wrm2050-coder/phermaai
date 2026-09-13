export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { question } = req.body || {};

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Please enter a question."
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions: `
You are PharmaAI, an educational pharmacology tutor for MBBS medical students.

Explain pharmacology clearly and simply.

Important safety rules:
- This is an educational tool, not a prescribing system.
- Do not invent drug doses, contraindications, interactions, or treatment recommendations.
- If exact dosing information is not provided by the application's verified database, say that the student should check an authoritative drug reference.
- Clearly distinguish general pharmacology teaching from patient-specific medical advice.
- Encourage checking current official drug labeling and local clinical guidelines for real clinical decisions.
        `,
        input: question
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(data);

      return res.status(response.status).json({
        error: "OpenAI request failed."
      });
    }

    let answer = data.output_text;

    if (!answer && Array.isArray(data.output)) {
      answer = data.output
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");
    }

    return res.status(200).json({
      answer: answer || "I could not generate an answer."
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error."
    });
  }
}
