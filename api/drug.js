export default async function handler(req, res) {

  const drugName = String(
    req.query.drug || ""
  ).trim();

  if (!drugName) {

    return res.status(400).json({
      error: "Drug name is required"
    });

  }

  try {

    /*
      =====================================================
      FDA OPENFDA DRUG LABEL SEARCH
      =====================================================
    */

    const searchTerm =
      drugName.replace(/"/g, '\\"');


    const fdaURL =
      "https://api.fda.gov/drug/label.json" +
      "?search=openfda.generic_name:" +
      encodeURIComponent('"' + searchTerm + '"') +
      "&limit=10";


    const response =
      await fetch(fdaURL);


    if (!response.ok) {

      /*
        Sometimes generic_name search may not find
        the drug. Try active ingredient as fallback.
      */

      const fallbackURL =
        "https://api.fda.gov/drug/label.json" +
        "?search=active_ingredient:" +
        encodeURIComponent(searchTerm) +
        "&limit=10";


      const fallbackResponse =
        await fetch(fallbackURL);


      if (!fallbackResponse.ok) {

        return res.status(404).json({

          error: "Drug not found",

          message:
            "No FDA drug label was found for this drug."

        });

      }


      const fallbackData =
        await fallbackResponse.json();


      return sendFDAResult(
        res,
        drugName,
        fallbackData
      );

    }


    const data =
      await response.json();


    return sendFDAResult(
      res,
      drugName,
      data
    );


  }

  catch (error) {

    console.error(
      "FDA drug lookup error:",
      error
    );


    return res.status(500).json({

      error: "Drug lookup failed",

      message: error.message

    });

  }

}


/* =========================================================
   BUILD CLEAN PHARMAAI RESPONSE
========================================================= */

function sendFDAResult(
  res,
  searchTerm,
  data
) {

  const records =
    data?.results || [];


  if (!records.length) {

    return res.status(404).json({

      error: "Drug not found",

      message:
        "No matching FDA drug label was found."

    });

  }


  /*
    Prefer a human prescription product when possible.
  */

  const record =
    chooseBestRecord(records);


  const openFDA =
    record?.openfda || {};


  const genericName =
    firstValue(
      openFDA.generic_name
    ) ||
    firstValue(
      record.active_ingredient
    ) ||
    searchTerm;


  const brandName =
    firstValue(
      openFDA.brand_name
    );


  const manufacturer =
    firstValue(
      openFDA.manufacturer_name
    );


  const productType =
    firstValue(
      openFDA.product_type
    );


  const route =
    uniqueValues(
      [
        ...(openFDA.route || []),
        ...(record.route || [])
      ]
    );


  const dosageForms =
    cleanSection(
      record.dosage_forms_and_strengths ||
      record.dosage_forms_and_strengths_table
    );


  const indications =
    cleanSection(
      record.indications_and_usage ||
      record.indications_and_usage_table ||
      record.purpose ||
      record.purpose_table
    );


  const dosage =
    cleanSection(
      record.dosage_and_administration ||
      record.dosage_and_administration_table
    );


  const contraindications =
    cleanSection(
      record.contraindications ||
      record.contraindications_table
    );


  const adverseEffects =
    cleanSection(
      record.adverse_reactions ||
      record.adverse_reactions_table
    );


  const interactions =
    cleanSection(
      record.drug_interactions ||
      record.drug_interactions_table
    );


  const mechanism =
    cleanSection(
      record.mechanism_of_action ||
      record.clinical_pharmacology
    );


  const warnings =
    cleanSection(
      record.boxed_warning ||
      record.warnings_and_cautions ||
      record.warnings ||
      record.general_precautions
    );


  const precautions =
    cleanSection(
      record.precautions ||
      record.general_precautions
    );


  const monitoring =
    cleanSection(
      record.laboratory_tests
    );


  const setId =
    record.set_id || "";


  const labelURL =
    setId

      ?

      "https://dailymed.nlm.nih.gov/" +
      "dailymed/drugInfo.cfm?setid=" +
      encodeURIComponent(setId)

      :

      "https://www.dailymed.nlm.nih.gov/";


  /*
    =======================================================
    RETURN STRUCTURED PHARMAAI DATA
    =======================================================
  */

  return res.status(200).json({

    found: true,

    source: "FDA openFDA",

    searchTerm: searchTerm,

    genericName: genericName,

    brandName: brandName,

    manufacturer: manufacturer,

    productType: productType,

    route: route,

    dosageForms: dosageForms,

    indications: indications,

    dosage: dosage,

    contraindications: contraindications,

    adverseEffects: adverseEffects,

    interactions: interactions,

    mechanism: mechanism,

    warnings: warnings,

    precautions: precautions,

    monitoring: monitoring,

    labelURL: labelURL,

    setId: setId,

    effectiveTime:
      record.effective_time || "",

    disclaimer:
      "FDA labeling data is provided for educational use. " +
      "Always verify current official labeling and clinical guidelines."

  });

}


/* =========================================================
   SELECT BEST LABEL
========================================================= */

function chooseBestRecord(records) {

  /*
    Prefer records that actually contain
    dosage + indications information.
  */

  const complete =
    records.find(record =>

      hasField(
        record,
        "dosage_and_administration"
      )

      &&

      hasField(
        record,
        "indications_and_usage"
      )

    );


  if(complete){

    return complete;

  }


  const withDosage =
    records.find(record =>

      hasField(
        record,
        "dosage_and_administration"
      )

    );


  if(withDosage){

    return withDosage;

  }


  return records[0];

}


/* =========================================================
   CHECK FIELD
========================================================= */

function hasField(
  object,
  field
) {

  return (

    object &&

    object[field] &&

    object[field].length > 0

  );

}


/* =========================================================
   FIRST VALUE
========================================================= */

function firstValue(value) {

  if(Array.isArray(value)){

    return value[0] || "";

  }


  if(typeof value === "string"){

    return value;

  }


  return "";

}


/* =========================================================
   UNIQUE VALUES
========================================================= */

function uniqueValues(values) {

  return [

    ...new Set(

      values

        .filter(Boolean)

        .map(value =>
          String(value).trim()
        )

    )

  ];

}


/* =========================================================
   CLEAN FDA TEXT
========================================================= */

function cleanSection(value) {

  if(!value){

    return [];

  }


  let values =
    Array.isArray(value)
      ? value
      : [value];


  let output = [];


  for(let item of values){

    if(item === null ||
       item === undefined){

      continue;

    }


    let text =
      String(item);


    /*
      Remove basic HTML.
    */

    text =
      text.replace(
        /<[^>]*>/g,
        " "
      );


    /*
      Decode common HTML entities.
    */

    text =
      text
        .replace(/&nbsp;/gi," ")
        .replace(/&amp;/gi,"&")
        .replace(/&lt;/gi,"<")
        .replace(/&gt;/gi,">")
        .replace(/&quot;/gi,'"')
        .replace(/&#39;/gi,"'");


    /*
      Normalize whitespace.
    */

    text =
      text
        .replace(/\r/g," ")
        .replace(/\n+/g,"\n")
        .replace(/[ \t]+/g," ")
        .trim();


    if(!text){

      continue;

    }


    /*
      Split very long FDA paragraphs
      into smaller readable pieces.
    */

    const pieces =
      text
        .split(/\n|(?<=[.!?])\s+(?=[A-Z0-9])/)
        .map(
          part => part.trim()
        )
        .filter(
          part => part.length > 15
        );


    output.push(
      ...pieces
    );

  }


  /*
    Remove duplicates.
  */

  output =
    [
      ...new Set(output)
    ];


  /*
    Prevent huge sections.
    */

  return output.slice(
    0,
    40
  );

}
