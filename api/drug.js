export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const drug = (req.query.drug || "").trim();

  if (!drug) {
    return res.status(400).json({
      error: "Please provide a drug name."
    });
  }

  try {
    const url =
      "https://api.fda.gov/drug/label.json?search=" +
      encodeURIComponent(
        `openfda.brand_name:"${drug}" OR openfda.generic_name:"${drug}"`
      ) +
      "&limit=5";

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.results) {
      return res.status(404).json({
        error: "Drug not found in the FDA database."
      });
    }

    const results = data.results.map(item => ({
      brandName: item.openfda?.brand_name || [],
      genericName: item.openfda?.generic_name || [],
      manufacturer: item.openfda?.manufacturer_name || [],

      activeIngredient:
        item.active_ingredient || [],

      drugClass:
        item.pharm_class || [],

      route:
        item.openfda?.route || [],

      indications:
        item.indications_and_usage || [],

      dosage:
        item.dosage_and_administration || [],

      contraindications:
        item.contraindications || [],

      warnings:
        item.warnings || [],

      adverseReactions:
        item.adverse_reactions || [],

      interactions:
        item.drug_interactions || [],

      clinicalPharmacology:
        item.clinical_pharmacology || [],

      pregnancy:
        item.pregnancy || [],

      pediatricUse:
        item.pediatric_use || [],

      geriatricUse:
        item.geriatric_use || []
    }));

    return res.status(200).json({
      query: drug,
      results
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Unable to retrieve drug information."
    });
  }
}
