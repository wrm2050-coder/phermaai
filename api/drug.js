export default async function handler(req, res) {
  const drugName = String(req.query.drug || "").trim();

  if (!drugName) {
    return res.status(400).json({
      error: "Drug name is required"
    });
  }

  try {
    /*
      =========================================================
      1. SEARCH RXNORM
      =========================================================
    */

    const rxnormURL =
      "https://rxnav.nlm.nih.gov/REST/drugs.json?name=" +
      encodeURIComponent(drugName);

    const rxnormResponse = await fetch(rxnormURL);

    if (!rxnormResponse.ok) {
      throw new Error("RxNorm request failed");
    }

    const rxnormData = await rxnormResponse.json();

    const conceptGroups =
      rxnormData?.drugGroup?.conceptGroup || [];

    const concepts = [];

    for (const group of conceptGroups) {
      if (!group.conceptProperties) continue;

      for (const concept of group.conceptProperties) {
        concepts.push({
          rxcui: concept.rxcui,
          name: concept.name,
          synonym: concept.synonym || "",
          tty: concept.tty,
          psn: concept.psn || ""
        });
      }
    }

    if (concepts.length === 0) {
      return res.status(404).json({
        error: "Drug not found",
        message: "No matching drug was found in RxNorm."
      });
    }

    /*
      =========================================================
      2. FIND THE MAIN DRUG / INGREDIENT
      =========================================================
    */

    const ingredient =
      concepts.find(c => c.tty === "IN") ||
      concepts.find(c => c.tty === "PIN") ||
      concepts.find(c => c.tty === "SCD") ||
      concepts[0];

    const rxcui = ingredient.rxcui;

    /*
      =========================================================
      3. SEARCH DAILYMED USING RXCUI
      =========================================================
    */

    const dailyMedURL =
      "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json" +
      "?rxcui=" +
      encodeURIComponent(rxcui) +
      "&pagesize=10";

    const dailyMedResponse =
      await fetch(dailyMedURL);

    let dailyMedData = null;

    if (dailyMedResponse.ok) {
      dailyMedData = await dailyMedResponse.json();
    }

    /*
      =========================================================
      4. EXTRACT DAILYMED LABELS
      =========================================================
    */

    const labels =
      dailyMedData?.data ||
      dailyMedData?.spls ||
      [];

    const cleanLabels = labels.map(label => ({
      setid:
        label.setid ||
        label.set_id ||
        null,

      title:
        label.title ||
        label.drug_name ||
        label.drugName ||
        "",

      publishedDate:
        label.published_date ||
        label.publishedDate ||
        "",

      labeler:
        label.labeler ||
        label.manufacturer ||
        ""
    }));

    /*
      =========================================================
      5. RETURN CLEAN DATA TO PHARMAAI
      =========================================================
    */

    return res.status(200).json({
      found: true,

      searchTerm: drugName,

      genericName:
        ingredient.name || drugName,

      rxcui: rxcui,

      synonym:
        ingredient.synonym || "",

      termType:
        ingredient.tty || "",

      prescribableName:
        ingredient.psn || "",

      products: concepts
        .filter(c =>
          ["SCD", "SBD", "GPCK", "BPCK"].includes(c.tty)
        )
        .slice(0, 30)
        .map(c => ({
          rxcui: c.rxcui,
          name: c.name,
          type: c.tty
        })),

      labels: cleanLabels,

      sources: {
        rxnorm:
          "https://rxnav.nlm.nih.gov/",

        dailymed:
          "https://dailymed.nlm.nih.gov/"
      }
    });

  } catch (error) {

    console.error("Drug API error:", error);

    return res.status(500).json({
      error: "Drug lookup failed",
      message: error.message
    });
  }
}
