// FAQs for each glossary term (More info): { term: [[question, answer], x3] }
const GLOSSARY_FAQ = {
"F00": [
[
"What is area F00?",
"F00 is the general site area for the FIM plant. It covers site wide items that do not belong to one process area, such as HV power distribution, buried services and pipe racks."
],
[
"Why does the F00 code matter?",
"Site wide infrastructure is often shared by several process areas, so tagging it F00 keeps ownership clear and avoids splitting one system across many area codes."
],
[
"How do I find F00 items in the app?",
"Search for tags starting with F00. Site wide electrical items are a good place to start with the SLDs, which open in the app's viewer."
]
],
"F10": [
[
"What is area F10?",
"F10 is the existing FIM primary crushing area, known as Primary Crusher 1 (PC1). It contains the existing gyratory crusher and its feed and discharge equipment."
],
[
"Why does the F10 code matter?",
"The new Primary Crusher 2 in F12 runs in parallel with PC1, so it helps to know which crusher a tag belongs to when tracing feed to the stockpiles."
],
[
"How do I find F10 items in the app?",
"Tags start with F10, for example F10-CG-01 for the existing gyratory crusher. Existing equipment usually carries low numbers like 01 rather than the 401 series used for new items."
]
],
"F12": [
[
"What is area F12?",
"F12 is the new primary crushing area, Primary Crusher 2 (PC2), including its discharge apron feeder, stockpile feed conveyor and the new crushed ore stockpile."
],
[
"Why does the F12 code matter?",
"It is the front end of the Growth Project's new ore feed path, so its availability and throughput directly set how much ore reaches the new SAG mill."
],
[
"How do I find F12 items in the app?",
"Search F12 tags, for example F12-CG-401 (the new gyratory) or F12-FA-401 (discharge apron feeder). Each equipment page shows Details plus related Instruments and Cables pills."
]
],
"F13": [
[
"What is area F13?",
"F13 is the new milling and classification area: the new SAG mill, the ball mill, pebble crushing, the primary cyclones and the trash screens."
],
[
"Why does the F13 code matter?",
"It is the heart of the SABC grinding circuit, and its grind size affects flotation and leach recovery downstream. Most large drives in the expansion sit here."
],
[
"How do I find F13 items in the app?",
"Search F13 tags such as F13-MS-401 (SAG mill), F13-MB-401 (ball mill) or F13-CY-401 (cyclones). Motor and drive data shows under the Electrical band on the equipment page."
]
],
"F14": [
[
"What is area F14?",
"F14 is the gravity circuit and intensive leaching area. It takes part of the cyclone underflow through Knelson concentrators, and the gravity concentrate is leached in the intensive leach reactor (ILR)."
],
[
"Why does the F14 code matter?",
"Gravity recovers coarse free gold early, before flotation and CIL, which improves overall recovery and reduces gold lockup in the grinding circuit."
],
[
"How do I find F14 items in the app?",
"Search F14 tags, for example F14-IL-403 for the intensive leach reactor or F14-CY-411 for a gravity cyclone. Drawings for the area open in the app's viewer."
]
],
"F15": [
[
"What is area F15?",
"F15 is the Mt Charlotte stockpile and reclaim area, covering the stockpile and the feeders and conveyors that reclaim ore from it."
],
[
"Why does the F15 code matter?",
"It is a separate stockpile system from the new crushed ore stockpile in F12, so check the area code when you trace which feeders supply which mill."
],
[
"How do I find F15 items in the app?",
"Tags start with F15, for example F15-FA-52A (a reclaim apron feeder). These are existing items, so they use the older numbering rather than the 401 series."
]
],
"F16": [
[
"What is area F16?",
"F16 is the new rougher and scavenger flotation area, using FLS forced air tank cells. Rougher and scavenger concentrate goes on to cleaning, and scavenger tails go to the flotation tails thickener."
],
[
"Why does the F16 code matter?",
"Rougher and scavenger flotation recovers the gold bearing sulphides from the mill product, so it sets the mass and grade of concentrate sent to UFG and leaching."
],
[
"How do I find F16 items in the app?",
"Search F16 tags: the cells are F16-CF-411 to F16-CF-417 and their agitators include F16-AG-421. The agitator pages list motor RTDs under related Instruments."
]
],
"F17": [
[
"What is area F17?",
"F17 is the flotation tailings pre-leach thickening area. It thickens scavenger and cleaner-scavenger tails before they go on to leaching, and its overflow returns water to the process water system."
],
[
"Why does the F17 code matter?",
"Thickening raises the slurry density before leaching, which cuts tank volume and reagent use, and recovers saline process water for reuse."
],
[
"How do I find F17 items in the app?",
"Search tags starting with F17. Thickener vendor signals such as rake torque and bed level appear as instruments linked to the thickener equipment page."
]
],
"F18": [
[
"What is area F18?",
"F18 is the new cleaner and cleaner-scavenger flotation area, using Glencore Jameson cells. It upgrades rougher and scavenger concentrate into final concentrate."
],
[
"Why does the F18 code matter?",
"Cleaning sets the final concentrate grade and mass going to UFG and concentrate leaching. Jameson cells differ from tank cells because air is drawn in by the pumped flow through the downcomers."
],
[
"How do I find F18 items in the app?",
"Search F18 tags. The final concentrate hopper is F18-HP-414, which feeds the concentrate thickener. Related P&IDs open in the app's viewer."
]
],
"F19": [
[
"What is area F19?",
"F19 is the existing FIM milling and classification area, Area A, which includes the old FIM SAG mill and its cyclones."
],
[
"Why does the F19 code matter?",
"The existing FIM SAG keeps running alongside the new SAG in F13, and its discharge is pumped across to the new primary cyclone feed hopper, so the two areas interact."
],
[
"How do I find F19 items in the app?",
"Search F19 tags, for example F19-CY-51A or F19-CC-65A. Existing equipment uses the older numbering, not the 401 series."
]
],
"F20": [
[
"What is area F20?",
"F20 is milling and classification Area B, part of the existing FIM milling plant."
],
[
"Why does the F20 code matter?",
"Several existing milling items are reused, modified or made redundant by the expansion, so the area code helps you tell existing scope from new F13 equipment."
],
[
"How do I find F20 items in the app?",
"Search tags starting with F20. If a document for the area is not in the app, the link opens it in SharePoint."
]
],
"F21": [
[
"What is area F21?",
"F21 is the flotation tailings CIL4 area. CIL4 leaches thickened flotation tails and concentrate CIL tails with cyanide and adsorbs the dissolved gold onto carbon."
],
[
"Why does the F21 code matter?",
"It recovers gold that would otherwise be lost to the tailings, and it is a major part of the Stage 2 scope."
],
[
"How do I find F21 items in the app?",
"Search F21 tags; the CIL4 tanks are F21-TK-411 to F21-TK-418. Instruments such as pH and cyanide analysers show as Instruments pills on the tank pages."
]
],
"F22": [
[
"What is area F22?",
"F22 covers CIL4 carbon treatment and elution, including acid wash, elution and the CIL4 carbon regeneration kiln."
],
[
"Why does the F22 code matter?",
"Loaded carbon from CIL4 must be stripped of gold and reactivated before it returns to the leach, so F22 availability limits how much gold CIL4 can recover."
],
[
"How do I find F22 items in the app?",
"Search F22 tags, for example F22-KN-411 for the CIL4 regeneration kiln. Its page links instruments such as the kiln area mercury analyser."
]
],
"F23": [
[
"What is area F23?",
"F23 is final tailings handling and storage. It covers the final tails tank and the tailings pumps that send leached tails to the tailings storage facility."
],
[
"Why does the F23 code matter?",
"Tailings lines are long and carry high solids slurry, so pump duty, line monitoring and leak detection matter for both production and environmental compliance."
],
[
"How do I find F23 items in the app?",
"Search tags starting with F23. Pumps and their flow, density and pressure instruments appear as linked pages and Instruments pills."
]
],
"F24": [
[
"What is area F24?",
"F24 is the new air and water services area for the Growth Project, such as new compressed air and water distribution systems."
],
[
"Why does the F24 code matter?",
"Services must be in place before process equipment can be commissioned, and many process areas depend on them, so F24 items are often on the critical path."
],
[
"How do I find F24 items in the app?",
"Search F24 tags. Compare with F75 and F81, which cover the existing water and air services."
]
],
"F25": [
[
"What is area F25?",
"F25 is the existing cleaner flotation area of the FIM plant."
],
[
"Why does the F25 code matter?",
"The new Jameson cleaner circuit in F18 takes over cleaning in the expansion, so F25 items are existing scope that may be reused, modified or retired."
],
[
"How do I find F25 items in the app?",
"Search tags starting with F25. Existing items use the older numbering, while new cleaner equipment sits in F18."
]
],
"F26": [
[
"What is area F26?",
"F26 is the existing cleaner-scavenger flotation area of the FIM plant."
],
[
"Why does the F26 code matter?",
"It helps separate existing equipment from the new cleaner-scavenger Jameson cell in F18 when reading drawings or scope documents."
],
[
"How do I find F26 items in the app?",
"Search tags starting with F26. Check the equipment status in Details to see whether an item is existing, modified or redundant."
]
],
"F28": [
[
"What is area F28?",
"F28 is the new ultra fine grinding area, UFG 2 and UFG 3, using IsaMill M15000 mills to grind flotation concentrate very fine before leaching."
],
[
"Why does the F28 code matter?",
"Fine grinding liberates gold locked in sulphides so it can be leached. UFG 3 is the Stage 2 mill intended to allow the offsite roaster to be decommissioned."
],
[
"How do I find F28 items in the app?",
"Search F28 tags, for example F28-MUF-401 or F28-CY-421. Mill motor and drive data appears under the Electrical band."
]
],
"F30": [
[
"What is area F30?",
"F30 covers concentrate pre-leach thickening, the CIL2 and CIL3 tanks and post-leach thickening. In Stage 2, CIL2 is repurposed for leaching and CIL3 for adsorption."
],
[
"Why does the F30 code matter?",
"This is where the high grade concentrate gold is dissolved and loaded onto carbon, so it carries a large share of the plant's gold production."
],
[
"How do I find F30 items in the app?",
"Search tags starting with F30. Many items here are existing tanks with older tags such as 30-TH-31, which is being repurposed as the concentrate pre-leach thickener."
]
],
"F34": [
[
"What is area F34?",
"F34 is the existing ultra fine grinding area, UFG 1, which uses an IsaMill M3000."
],
[
"Why does the F34 code matter?",
"UFG 1 is much smaller than the new UFG 2 and 3 mills in F28, and in Stage 2 it takes excess concentrate when the new mills are at maximum."
],
[
"How do I find F34 items in the app?",
"Search tags starting with F34, for example F34-MUF-01. Compare with F28 for the new UFG mills."
]
],
"F35": [
[
"What is area F35?",
"F35 is concentrate handling and filtration, including the concentrate thickener, filter feed tanks, vacuum belt filters and concentrate stockpile."
],
[
"Why does the F35 code matter?",
"It balances concentrate between UFG, leaching and filtration, so it matters when concentrate production exceeds UFG capacity."
],
[
"How do I find F35 items in the app?",
"Search tags starting with F35. Related PFDs and P&IDs open in the app's viewer."
]
],
"F65": [
[
"What is area F65?",
"F65 is concentrate carbon treatment and elution, which strips gold from carbon loaded in the concentrate CIL circuit and regenerates the carbon."
],
[
"Why does the F65 code matter?",
"It is separate from the CIL4 elution in F22, so check the area code when you trace which carbon circuit an item serves."
],
[
"How do I find F65 items in the app?",
"Search F65 tags, for example F65-KN-61 and F65-KN-62 (regeneration kilns)."
]
],
"F66": [
[
"What is area F66?",
"F66 is electrowinning and the goldroom, where gold is plated from pregnant eluate onto cathodes and then smelted into doré."
],
[
"Why does the F66 code matter?",
"It is the final step to saleable product, so security, access control and equipment reliability are especially important here."
],
[
"How do I find F66 items in the app?",
"Search tags starting with F66. Rectifier and other electrical data appears under the Electrical band on the equipment page."
]
],
"F70": [
[
"What is area F70?",
"F70 is the existing lime plant and flocculant area, which slakes quicklime into milk of lime and prepares flocculant for the thickeners."
],
[
"Why does the F70 code matter?",
"Lime controls pH in leaching and flocculant drives thickener performance, so problems here quickly affect CIL and thickening."
],
[
"How do I find F70 items in the app?",
"Search tags starting with F70. Compare with F72 for the new reagent mixing and storage."
]
],
"F71": [
[
"What is area F71?",
"F71 is the existing reagents area of the FIM plant."
],
[
"Why does the F71 code matter?",
"Existing reagent systems may be tied into or extended for the expansion, so the area code helps separate existing scope from new F72 reagent facilities."
],
[
"How do I find F71 items in the app?",
"Search tags starting with F71. If a document is not stored in the app, the link opens it in SharePoint."
]
],
"F72": [
[
"What is area F72?",
"F72 is the reagents mixing and storage area for the Growth Project, covering new reagent tanks, mixing systems and dosing pumps."
],
[
"Why does the F72 code matter?",
"Reagents such as cyanide, caustic and acid are hazardous, so storage, bunding and dosing control in this area matter for safety as well as process."
],
[
"How do I find F72 items in the app?",
"Search tags starting with F72. Dosing pumps and their flowmeters appear as linked equipment and Instruments pills."
]
],
"F75": [
[
"What is area F75?",
"F75 is the existing water services area, covering existing water tanks, pumps and distribution."
],
[
"Why does the F75 code matter?",
"The plant uses several water types, including saline process water and fresh scheme water, so confirm which system a tie in connects to."
],
[
"How do I find F75 items in the app?",
"Search tags starting with F75. Compare with F24 for the new water services."
]
],
"F78": [
[
"What is area F78?",
"F78 is the existing carbon regeneration area, which reactivates stripped carbon in kilns before it returns to adsorption."
],
[
"Why does the F78 code matter?",
"Regenerated carbon keeps adsorption efficiency up. F78 is existing scope, separate from the new CIL4 kiln in F22."
],
[
"How do I find F78 items in the app?",
"Search F78 tags, for example F78-KN-65."
]
],
"F81": [
[
"What is area F81?",
"F81 is the existing air services area, such as existing compressors and air receivers."
],
[
"Why does the F81 code matter?",
"Plant and instrument air are utilities that many areas depend on, so changes or outages here can affect much of the plant."
],
[
"How do I find F81 items in the app?",
"Search tags starting with F81. Compare with F24 for new air services."
]
],
"T03": [
[
"What is T03?",
"T03 is the area code for the Fim III Tailings Storage Facility (TSF), where final tailings are deposited."
],
[
"How does T03 relate to F23?",
"F23 covers the final tails tank and tailings pumps in the plant. T03 is the storage facility at the end of the tailings lines."
],
[
"Why does T03 matter on site?",
"The TSF is a regulated facility, so pipeline routing, leak detection and decant water return are closely controlled. Decant water returns to the plant as cyanide water."
]
],
"N02": [
[
"What is N02?",
"N02 is the area code for the Kaltails borefields, which supply saline bore water to the plant."
],
[
"Why is the water saline?",
"Local groundwater around Kalgoorlie is hypersaline. Saline water is used as process water, while fresh scheme water is kept for uses that need clean water such as UFG mill gland seals."
],
[
"Why does saline water matter for mechanical design?",
"Saline water is corrosive, so pipe, pump and valve materials must suit it. Check the material of construction in the equipment Details."
]
],
"SP1 / SP2": [
[
"What do SP1 and SP2 mean?",
"They are Separable Portion 1 and 2, the contract scope split for Stage 1 and Stage 2 of the Growth Project."
],
[
"Where will I see SP1 or SP2?",
"They appear in PFD legends and scope documents to mark which equipment or lines belong to each stage."
],
[
"Why does the split matter?",
"Each separable portion can have its own schedule, handover and commissioning, so it tells you when an item is due and which contract scope covers it."
]
],
"401": [
[
"What does 401 mean in a tag?",
"New Growth Project equipment numbers start at 401, so a tag like F13-MS-401 is new equipment. Existing items generally keep lower numbers such as 01 or 51A."
],
[
"How do I tell new from existing equipment?",
"Look at the number after the equipment code. The 401 series and above is new, for example F12-CG-401, while F10-CG-01 is the existing crusher."
],
[
"Does every new item start at exactly 401?",
"No. 401 is the start of the range, and numbers go up from there, for example F16-CF-411 to F16-CF-417 for the rougher and scavenger cells."
]
],
"AG": [
[
"What is AG in a tag?",
"AG is the equipment code for an agitator, a motor driven impeller that keeps slurry or reagent mixed in a tank or flotation cell."
],
[
"Why must agitators keep running?",
"If an agitator stops with slurry in the tank, solids settle and can bog the impeller, making restart difficult or damaging the drive. Flotation cell agitators are kept running whenever the cell holds slurry or water."
],
[
"Where do I see AG equipment in the app?",
"Search AG tags, for example F16-AG-421, a rougher flotation cell agitator. Its page lists motor bearing and winding RTDs under related Instruments."
]
],
"BN": [
[
"What is BN in a tag?",
"BN is the equipment code for a bin, a storage vessel for bulk solids such as ore, pebbles or grinding media, usually discharging to a feeder."
],
[
"How does a bin differ from a hopper?",
"Both hold material, but bins are generally used for bulk solids storage with some surge capacity, while hoppers (HP) are often smaller and in this plant are also used for slurry, such as pump feed hoppers."
],
[
"Where do I see BN equipment in the app?",
"Search BN tags, for example F12-BN-401 or F13-BN-402. Level instruments linked to the bin show as Instruments pills."
]
],
"CC": [
[
"What is CC in a tag?",
"CC is the equipment code for a cone crusher. In this plant cone crushers crush SAG mill pebbles before they return to the grinding circuit."
],
[
"How does a cone crusher differ from a gyratory?",
"Both crush between a gyrating mantle and a fixed bowl. A gyratory (CG) takes large run of mine rock as a primary crusher, while a cone crusher takes smaller feed and produces finer product."
],
[
"Where do I see CC equipment in the app?",
"Search CC tags, for example F13-CC-401. Its page links instruments such as bowl adjustment limit switches and countershaft speed sensors."
]
],
"CF": [
[
"What is CF in a tag?",
"CF is the equipment code for a flotation cell, where air bubbles carry hydrophobic sulphide particles into a froth that is collected as concentrate."
],
[
"How do the F16 and F18 cells differ?",
"F16 uses FLS forced air tank cells with agitators for rougher and scavenger duty. F18 uses Jameson cells, where air is drawn in by slurry pumped through downcomers."
],
[
"Where do I see CF equipment in the app?",
"Search CF tags, for example F16-CF-411 to F16-CF-417. Each cell's agitator has its own AG tag."
]
],
"CG": [
[
"What is CG in a tag?",
"CG is the equipment code for a gyratory crusher, the primary crusher that takes run of mine ore from trucks and reduces it for the stockpile."
],
[
"How does a gyratory differ from a cone crusher?",
"A gyratory has a tall crushing chamber for very large feed and high throughput as a primary crusher. A cone crusher (CC) is a smaller machine for finer secondary or pebble crushing."
],
[
"Where do I see CG equipment in the app?",
"Search CG tags: F12-CG-401 is the new Primary Crusher 2 and F10-CG-01 is the existing crusher. Mechanical components and instruments are linked from the equipment page."
]
],
"CN": [
[
"What is CN in a tag?",
"CN is the equipment code for an elution column, a pressure vessel where loaded carbon is acid washed and then stripped of gold with hot caustic cyanide solution."
],
[
"Why is the column pressurised?",
"Elution runs hot, so the column is held under pressure to stop the solution flashing to steam. That makes it a pressure vessel with related design and inspection requirements."
],
[
"Where do I see CN equipment in the app?",
"Search CN tags or look in the elution areas, F22 for CIL4 and F65 for concentrate. Related P&IDs open in the app's viewer."
]
],
"CV": [
[
"What is CV in a tag?",
"CV is the equipment code for a belt conveyor carrying ore between crushers, stockpiles and mills."
],
[
"Which area code does a conveyor take?",
"Under the numbering rules a conveyor takes the area it feeds, so a conveyor discharging into the milling area carries an F13 tag."
],
[
"Where do I see CV equipment in the app?",
"Search CV tags, for example F12-CV-401. The page links safety devices such as pull wires and belt drift switches under Instruments."
]
],
"CY": [
[
"What is CY in a tag?",
"CY is the equipment code for a hydrocyclone, which separates slurry by particle size. Fine overflow goes forward and coarse underflow returns for more grinding."
],
[
"Is CY one cyclone or a cluster?",
"A tag can refer to a cyclone cluster with many cyclones on one manifold, such as the primary cyclone cluster. Check the description in Details."
],
[
"Where do I see CY equipment in the app?",
"Search CY tags, for example F13-CY-401 (primary cyclones), F14-CY-411 (gravity cyclone) or F28-CY-421 (UFG cyclones)."
]
],
"FA": [
[
"What is FA in a tag?",
"FA is the equipment code for an apron feeder, a heavy duty feeder with overlapping steel pans that draws coarse ore from under a crusher or stockpile."
],
[
"How does an apron feeder differ from a belt feeder?",
"Apron feeders handle coarse, heavy ore and high impact loads, such as under a primary crusher. Belt feeders (FB) suit finer material and lighter duty."
],
[
"Where do I see FA equipment in the app?",
"Search FA tags, for example F12-FA-401 (Primary Crusher 2 discharge apron feeder) or F13-FA-411. Gearbox and drive instruments show as Instruments pills."
]
],
"FB": [
[
"What is FB in a tag?",
"FB is the equipment code for a belt feeder, a short, slow belt that meters material out of a bin or hopper at a controlled rate."
],
[
"How does a belt feeder differ from a conveyor?",
"A conveyor (CV) transports material over a distance, while a belt feeder controls the draw rate from under a bin, usually with a variable speed drive."
],
[
"Where do I see FB equipment in the app?",
"Search FB tags, for example F10-FB-01A or F19-FB-61A. These are existing items using the older numbering."
]
],
"HP": [
[
"What is HP in a tag?",
"HP is the equipment code for a hopper, a vessel that receives material and feeds it on. In this plant many hoppers are slurry pump feed hoppers."
],
[
"Why do pump hopper levels matter?",
"Hopper level is controlled with pump speed and water addition to keep the pump supplied and line velocity high enough to stop solids settling."
],
[
"Where do I see HP equipment in the app?",
"Search HP tags, for example F18-HP-414 (final concentrate hopper) or F13-HP-401. Level instruments appear as Instruments pills."
]
],
"IL": [
[
"What is IL in a tag?",
"IL is the equipment code for the intensive leach reactor (ILR), which leaches gravity concentrate with high strength cyanide in batches."
],
[
"How does the ILR differ from CIL?",
"The ILR treats a small mass of high grade gravity concentrate with strong cyanide, while CIL tanks treat the bulk slurry at lower strength with carbon in the tanks."
],
[
"Where do I see IL equipment in the app?",
"Search IL tags; F14-IL-403 is the intensive leach reactor in the gravity area. Its pregnant solution goes to gravity electrowinning in F66."
]
],
"KN": [
[
"What is KN in a tag?",
"KN is the equipment code for a carbon regeneration kiln, which heats stripped carbon to restore its ability to adsorb gold."
],
[
"Why does a kiln have a mercury analyser?",
"Heating carbon can release mercury from the ore, so the kiln area is monitored and off gas is treated to protect people and the environment."
],
[
"Where do I see KN equipment in the app?",
"Search KN tags: F22-KN-411 (CIL4 kiln), F65-KN-61 and F65-KN-62, and existing F78-KN-65."
]
],
"MB": [
[
"What is MB in a tag?",
"MB is the equipment code for a ball mill, a rotating drum charged with steel balls that grinds SAG product down to flotation feed size."
],
[
"How does a ball mill differ from a SAG mill?",
"A SAG mill (MS) uses the ore itself plus a small ball charge for coarse grinding. A ball mill uses a larger ball charge to grind finer, in closed circuit with cyclones."
],
[
"Where do I see MB equipment in the app?",
"Search MB tags; F13-MB-401 is the new ball mill. Pinion bearing temperature and vibration instruments appear as Instruments pills, and drive data under the Electrical band."
]
],
"MS": [
[
"What is MS in a tag?",
"MS is the equipment code for a semi autogenous grinding (SAG) mill, a large diameter mill that grinds crushed ore using the ore itself and a small steel ball charge."
],
[
"Why are SAG mill starts coordinated?",
"SAG mills are among the largest drives on site, so the operator gets approval before starting one, and start sirens warn people nearby."
],
[
"Where do I see MS equipment in the app?",
"Search MS tags; F13-MS-401 is the new SAG mill. Its page links bearing temperature and vibration instruments and the barring siren."
]
],
"MU / MUF": [
[
"What do MU and MUF mean?",
"They are equipment codes for ultra fine grinding (UFG) mills. MU was meant for existing mills and MUF for new ones, but in the project data both the existing and new UFG mills are tagged MUF."
],
[
"Which tags use these codes?",
"The new UFG mills in F28 are tagged F28-MUF-401 and up. The existing UFG 1 mill in F34 is tagged F34-MUF-01. No tags use MU on its own."
],
[
"How does a UFG mill differ from a ball mill?",
"A UFG mill is a stirred mill that grinds flotation concentrate with fine ceramic media to a few microns. A ball mill (MB) grinds ore to around flotation feed size."
]
],
"MG": [
[
"What is MG in a tag?",
"MG is the equipment code for a tramp magnet, an overhead magnet that lifts stray steel such as bolts, teeth and drill steel off a conveyor."
],
[
"Why are tramp magnets needed?",
"Tramp steel can damage crushers, rip belts and block chutes, so it is removed before ore reaches downstream equipment such as pebble crushers."
],
[
"Where do I see MG equipment in the app?",
"Search MG tags, for example F12-MG-401 or F13-MG-403. Faults and run signals show as Instruments pills."
]
],
"PP": [
[
"What is PP in a tag?",
"PP is the equipment code for a process pump, typically a centrifugal slurry or solution pump."
],
[
"What should I check on a slurry pump?",
"Check duty and standby arrangement, gland water supply, materials for saline slurry and drive type. Pumps often have actuated suction, discharge and dump valves."
],
[
"Where do I see PP equipment in the app?",
"Search PP tags, for example F13-PP-401 or F14-PP-421. Motor and starter data appear under the Electrical band, with cables as Cables pills."
]
],
"PS": [
[
"What is a PS pump?",
"A sump pump, usually a vertical spindle pump that lifts spillage and washdown slurry out of a floor or bund sump and returns it to the process."
],
[
"How does PS differ from PP?",
"PP is a process pump on a main process stream. PS pumps only clear sumps, run intermittently on level, and must tolerate trash and variable density."
],
[
"How is a sump pump usually controlled?",
"Normally on sump level, starting at high level and stopping at low level, with alarms if the level keeps rising. Check the related Instruments pill on its equipment page."
]
],
"PW": [
[
"What does PW cover?",
"Water pumps: process water, raw or scheme water, gland water and similar clean or near clean water duties, as opposed to slurry."
],
[
"How does a PW pump differ from a PP pump?",
"PP pumps handle process slurry and are built for abrasion. PW pumps handle water, so they are usually standard centrifugal pumps with lower wear allowances."
],
[
"Where do I find its motor and cable data?",
"Open the equipment page. Motor and drive details sit under the Electrical band, and the related Cables pill lists its power and control cables."
]
],
"RB": [
[
"What is a rock breaker?",
"A hydraulic boom with a hammer, mounted over a ROM bin or crusher feed, used to break oversize rocks and clear bridging so the crusher can keep running."
],
[
"Why does it matter to crusher operation?",
"Oversize or bridged rock at the grizzly or crusher throat stops feed. The rock breaker clears it without manual entry, and its position is often interlocked with trucks tipping."
],
[
"What should a mechanical engineer watch on a rock breaker?",
"Hydraulic power pack condition, hose wear, boom pins and bushes, and the hammer tool, which all take heavy shock loading."
]
],
"SA": [
[
"What is an Isa sampler?",
"An automatic slurry sampler that cuts a representative sample from a process stream, typically for metallurgical accounting or to feed an onstream analyser."
],
[
"Why are samplers important?",
"Plant recovery and reagent control depend on representative samples. A blocked or poorly cutting sampler gives misleading assays and OSA readings."
],
[
"How does SA differ from Carbon Scout?",
"SA samplers take slurry samples from process streams. Carbon Scout is a specific auto sampler that measures carbon concentration in CIL tanks."
]
],
"SC": [
[
"What does SC cover?",
"Screens, vibrating or static, used to separate material by size, for example sizing, dewatering or carbon recovery duties."
],
[
"How does SC differ from SL?",
"SC is a general screen. SL is a trash screen whose job is to remove wood, plastic and other debris from slurry rather than to size ore."
],
[
"What wears on a screen?",
"Screen panels or wedge wire decks, spray nozzles, and on vibrating screens the exciter bearings and springs."
]
],
"SL": [
[
"What is a trash screen?",
"A screen that removes trash such as wood, plastic, rubber and liner bolts from slurry before downstream equipment like flotation, UFG or CIL."
],
[
"Why does trash removal matter?",
"Trash blocks cyclones, nozzles, valves, intertank screens and IsaMill media separators, and it can foul carbon. Removing it early protects downstream plant."
],
[
"Where is SL found in this plant?",
"Area F13 milling and classification includes trash screens per the glossary area list. Search by tag or open the area's P&IDs in the viewer."
]
],
"SU": [
[
"What does SU mean?",
"A sump as a civil or vessel item only, without its pump. The pump that empties it is tagged separately as PS."
],
[
"Why tag the sump separately from the pump?",
"The sump is a structure or vessel with its own level instruments, while the pump is rotating equipment with a motor, so each has its own tag and data."
],
[
"Where is SU shown in the app?",
"It appears as its own equipment entry with Details and Instruments pills, often linked to level transmitters that control the PS pump."
]
],
"TH": [
[
"What does a thickener do?",
"It settles solids from slurry, producing a dense underflow and a clear overflow that is recycled as process water. Flocculant helps the solids settle."
],
[
"What equipment makes up a thickener?",
"The tank, a rake drive and mechanism, feedwell, flocculant dosing, underflow pumps, and bed level and torque instruments."
],
[
"What key signals should I know?",
"Rake torque, bed level, underflow density and overflow clarity. High rake torque usually raises the rakes or trips the drive to protect it."
]
],
"TK": [
[
"What does TK cover?",
"Tanks of any duty, for example leach and adsorption tanks, surge tanks, reagent storage and water tanks."
],
[
"How does a TK differ from a VL?",
"A TK is a tank or vessel holding a volume. A VL is a launder, small sump or kibble used to convey or collect material."
],
[
"What do I usually check on a tank?",
"Level instruments, agitator if fitted, nozzles and overflow, and the P&ID for connected lines. Instruments appear as pills on the equipment page."
]
],
"VL": [
[
"What does VL cover?",
"Launders, small sumps and kibbles, which are vessels used to convey or collect slurry or solids rather than store them."
],
[
"What is a launder?",
"An open channel that carries slurry or froth by gravity, for example flotation concentrate or overflow to the next stage."
],
[
"Why does launder slope matter?",
"Too flat and solids settle and block it. Too steep and wear and splashing rise. Slope and size are set by solids content and flow."
]
],
"WD": [
[
"What is a weightometer?",
"A belt scale on a conveyor that measures mass flow of ore, usually in t/h, along with a running total."
],
[
"Why does it matter?",
"Its tonnage is often the main throughput signal, used for feeder speed control and production reporting, so drift or poor calibration directly affects plant data."
],
[
"How is a weightometer kept accurate?",
"Regular zero and span checks, test weights or chain calibration, keeping the weigh idlers clean and aligned, and correct belt tension."
]
],
"SW": [
[
"What does SW mean in a tag?",
"A switchboard or MCC, the panel that distributes power and starts, protects and controls a group of motors."
],
[
"How does SW differ from SR?",
"SW is the switchboard itself. SR is the switchroom, the building or room that houses switchboards and drives."
],
[
"How do I find what a switchboard feeds?",
"Open the relevant SLD in the viewer, or check the Electrical band on an equipment page, which shows the board feeding that motor."
]
],
"VS": [
[
"What is VS in a tag?",
"A variable speed drive. It controls motor speed by varying supply frequency, and per the app's tag rules its tag is the motor tag with suffix -VS."
],
[
"Why use a VSD instead of a DOL starter?",
"A VSD gives speed control for flow or level loops, soft starting and lower inrush current. A DOL starter runs the motor at fixed full speed."
],
[
"Where do I see if equipment has a VSD?",
"Look under the Electrical band on the equipment page, or on the SLD, where the drive appears between the MCC and the motor."
]
],
"LCS": [
[
"What is a local control station?",
"A field push button station near the equipment, typically with start, stop and E stop, tagged with suffix -LCS."
],
[
"When can a drive be started from the LCS?",
"Per the app's control philosophy, LCS start works in Manual and Local modes. In Automatic the DCS controls the drive and only LCS stop works."
],
[
"Why is Local mode treated with care?",
"Local mode bypasses process interlocks and start permissives, though critical interlocks such as E stops remain active."
]
],
"SR": [
[
"What is a switchroom?",
"A building or room, often a transportable module, that houses switchboards, MCCs, VSDs and control panels for an area."
],
[
"How does SR differ from SW?",
"SR is the room. SW is a switchboard or MCC inside it."
],
[
"Why does a mechanical engineer care about switchrooms?",
"They need HVAC, cable entries, access and lifting provisions, and their location drives cable routes to the motors they feed."
]
],
"TR": [
[
"What does a transformer do here?",
"It steps voltage up or down, for example from HV distribution to the LV supply for an MCC."
],
[
"Where are transformers shown?",
"On the SLDs, which open in the app's viewer, showing primary and secondary voltages and the boards they feed."
],
[
"What is a neutral earthing resistor?",
"An NER limits earth fault current on a transformer neutral. The glossary notes its tag suffix is -NR."
]
],
"-P / -C / -I / -E": [
[
"What do cable suffixes tell me?",
"They give the cable's function: -P power, -C control, -I instrumentation, -E earth. The app's tag rules also list -N neutral, -D digital and -FO fibre."
],
[
"Why separate power and instrumentation cables?",
"Power cables induce noise in signal cables, so they run in separate ladder or with segregation, and instrumentation cables are usually screened."
],
[
"Where do I see cables for equipment?",
"On the equipment page, the related Cables pills list each cable by tag, so you can tell power from control by its suffix."
]
],
"FIT": [
[
"What is a FIT?",
"A flow indicating transmitter. It measures flow, shows it locally and sends a signal to the DCS."
],
[
"What flowmeter types are typical in slurry plants?",
"Magnetic flowmeters are common on slurry and water. Other duties may use ultrasonic, vortex, Coriolis or differential pressure meters."
],
[
"How is a FIT shown in the app?",
"It appears in the Instruments pills on the related equipment page, and on the P&ID that opens in the viewer."
]
],
"LT / LIC": [
[
"What is the difference between LT and LIC?",
"LT is the level transmitter that measures level. LIC is the controller function in the DCS that uses that signal to drive a valve or pump speed."
],
[
"What level technologies are common?",
"Radar and ultrasonic for tanks and sumps, pressure based for some vessels, and specific bed level sensors for thickeners."
],
[
"Where do I see these in the app?",
"Open the equipment page and check the Instruments pills, or follow the loop on the P&ID in the viewer."
]
],
"DT": [
[
"What is a density transmitter?",
"It measures slurry density, usually by a nuclear gauge or similar, giving percent solids or SG to the DCS."
],
[
"Why is density important?",
"Density controls water addition, cyclone performance, thickener underflow and pump duty. Wrong density hurts grinding, classification and leaching."
],
[
"How does DT relate to flow?",
"Combined with a flowmeter, density gives mass flow of solids, which is used for mass balance and control."
]
],
"AE / AIT": [
[
"What is the difference between AE and AIT?",
"AE is the analysis element or probe in the process. AIT is the transmitter that converts its reading for display and sends it to the DCS."
],
[
"What do analysers measure in this plant?",
"Typically pH, dissolved oxygen and cyanide concentration, which control lime, oxygen and cyanide addition in leaching."
],
[
"Why do analysers need extra maintenance?",
"Probes foul, scale and drift in slurry, so they need regular cleaning and calibration to keep control reliable."
]
],
"LAH / LAL": [
[
"What do LAH and LAL mean?",
"Level alarm high and level alarm low. They warn the operator that a vessel level has passed a set limit."
],
[
"How does an alarm differ from an interlock?",
"An alarm only warns. An interlock acts, for example stopping a pump on low low level or tripping feed on high high level."
],
[
"Where are alarm levels defined?",
"On the P&IDs and in the control philosophy or alarm schedule. Documents not held in the app link to SharePoint."
]
],
"ROM": [
[
"What is ROM ore?",
"Run of mine ore, the as mined material delivered from the pit or underground before any crushing."
],
[
"Why does ROM size matter?",
"ROM top size and hardness set the primary crusher duty and how often oversize needs the rock breaker."
],
[
"How does ROM differ from COS?",
"ROM is uncrushed feed to the primary crusher. COS is the coarse ore stockpile of crushed material that feeds the mills."
]
],
"COS": [
[
"What is the COS?",
"The coarse ore stockpile, which holds primary crushed ore between the crusher and the grinding circuit."
],
[
"Why have a stockpile?",
"It decouples crusher and mill operation so the mill keeps running during crusher stoppages and maintenance."
],
[
"How is ore reclaimed from the COS?",
"Usually by feeders under the stockpile discharging onto a mill feed conveyor, with a weightometer controlling feed rate."
]
],
"SABC": [
[
"What is a SABC circuit?",
"A grinding circuit of SAG mill, Ball mill and pebble Crusher. SAG pebbles are crushed and returned, and the ball mill grinds to final size."
],
[
"Why add pebble crushers?",
"Critical size pebbles build up in the SAG mill and limit throughput. Crushing them separately lifts SAG capacity."
],
[
"Where is SABC on this project?",
"Glossary area F13 covers the new SAG, ball mill, pebble crushing and cyclones. Open its PFDs in the viewer to follow the circuit."
]
],
"SAG": [
[
"What is a SAG mill?",
"A semi autogenous grinding mill, a large rotating drum using the ore itself plus a modest steel ball charge to grind."
],
[
"How does a SAG mill differ from a ball mill?",
"A SAG takes coarse feed and uses ore as media with some balls. A ball mill takes finer feed and relies on a larger steel ball charge."
],
[
"What are key SAG parameters?",
"Mill speed as percent of critical speed, ball charge and total load, grate open area, power draw and bearing pressure."
]
],
"P80 / F80": [
[
"What do P80 and F80 mean?",
"The sieve size that 80 percent of the product (P80) or feed (F80) passes."
],
[
"Why are they used?",
"They describe size reduction across a crusher or mill and are used with Bond work index to estimate grinding energy."
],
[
"What happens if P80 is too coarse?",
"Downstream recovery usually falls, for example poorer flotation liberation or slower leaching."
]
],
"OSS / CSS": [
[
"What are OSS and CSS?",
"Open side setting and closed side setting, the widest and narrowest gaps between the crusher mantle and concave during each gyration."
],
[
"Which controls product size?",
"CSS mainly sets product size. OSS affects the largest particles that can pass and the capacity."
],
[
"How is the setting adjusted?",
"Hydraulically on most modern crushers. On this project facts note the crusher gap can be auto adjusted from a camera particle size analyser."
]
],
"%Cs": [
[
"What is percent critical speed?",
"Mill speed as a percentage of the speed at which charge would centrifuge against the shell and stop tumbling."
],
[
"Why does it matter?",
"It controls the charge trajectory and grinding action. Too fast throws balls onto liners and damages them, too slow reduces grinding."
],
[
"How is mill speed varied?",
"With a variable speed drive on the mill motor, which lets operators trim %Cs to suit ore and liner wear."
]
],
"EGL": [
[
"What is EGL?",
"Effective grinding length, the inside length of a mill between liners where grinding happens."
],
[
"Why is EGL quoted?",
"Mill size is given as diameter by EGL, and both drive power draw and capacity."
],
[
"How does EGL differ from shell length?",
"Shell length is the steel shell. EGL is shorter since it is measured inside the liners and excludes the heads."
]
],
"Circ load": [
[
"What is circulating load?",
"The cyclone underflow returned to the mill, expressed as a percentage of new feed tonnage."
],
[
"Why does circulating load matter?",
"It affects mill efficiency and cyclone and pump sizing. Typical ball mill circuits run a few hundred percent."
],
[
"What if circulating load is too high?",
"The mill and cyclone feed pump can overload, and cyclones may rope, sending coarse material to overflow."
]
],
"Scats": [
[
"What are scats?",
"Oversize pieces, often worn balls and hard rock fragments, rejected by the ball mill discharge trommel."
],
[
"Where do scats go?",
"They are collected for removal, for example in a scats bunker, instead of entering the cyclone feed pump."
],
[
"Why does a sudden increase in scats matter?",
"It can point to a damaged trommel, worn balls, or hard ore, and it adds handling load."
]
],
"Pebbles": [
[
"What are pebbles?",
"Critical size rocks discharged from the SAG mill that grind slowly in the mill and are sent to pebble crushers."
],
[
"Why crush pebbles?",
"They build up in the SAG and limit throughput. Crushing and returning them raises capacity."
],
[
"How are pebbles protected from steel?",
"A tramp magnet and metal detection usually remove ball fragments before the pebble crushers."
]
],
"Roping": [
[
"What is cyclone roping?",
"When underflow is overloaded the spigot discharges a rope shaped stream instead of a spray, and coarse particles report to overflow."
],
[
"Why is roping bad?",
"Coarse material goes to flotation or downstream, hurting recovery and causing wear and sanding."
],
[
"How is roping fixed?",
"Reduce feed density or tonnage, open more cyclones, or change spigot size."
]
],
"Knelson": [
[
"What is a Knelson concentrator?",
"A centrifugal gravity concentrator that traps dense free gold in a spinning bowl, then flushes it as a small concentrate. The glossary model is KC-QS70."
],
[
"Where does it sit in the circuit?",
"It usually treats part of the cyclone underflow, recovering coarse gold before it is overground. Glossary area F14 covers the gravity circuit."
],
[
"Where does Knelson concentrate go?",
"To intensive leaching in the ILR, then to electrowinning."
]
],
"ILR": [
[
"What is an ILR?",
"An intensive leach reactor, which leaches gravity concentrate with high strength cyanide and oxygen. The glossary model is Acacia CS10000."
],
[
"Why not send gravity concentrate to CIL?",
"Coarse gold leaches slowly. Intensive leaching dissolves it quickly in a small, secure batch circuit."
],
[
"How does IL differ from ILR?",
"IL is the tag type code for the intensive leach reactor equipment, and ILR is the process term. Both refer to the same unit."
]
],
"PAX": [
[
"What is PAX?",
"Potassium amyl xanthate, a collector that coats sulphide minerals so they attach to air bubbles in flotation."
],
[
"How does PAX differ from frother?",
"PAX makes particles hydrophobic. Frother stabilises the froth and bubble size."
],
[
"What handling issues does PAX have?",
"It decomposes in heat and moisture and releases flammable carbon disulphide, so storage and mixing need care."
]
],
"CuSO₄": [
[
"What is copper sulphate used for?",
"As an activator in flotation, it helps xanthate attach to sulphides such as pyrite, improving recovery."
],
[
"How does an activator differ from a collector?",
"The activator conditions the mineral surface. The collector, such as PAX, makes it hydrophobic."
],
[
"Is copper sulphate hazardous?",
"Yes, it is toxic and corrosive, so it needs proper storage, bunding and PPE when mixing."
]
],
"Frother": [
[
"What does frother do?",
"It reduces bubble size and stabilises the froth so mineral laden bubbles carry to the launder. The glossary lists Luprofroth 168."
],
[
"How does it differ from PAX?",
"PAX attaches minerals to bubbles. Frother controls bubble and froth behaviour."
],
[
"What if frother dose is wrong?",
"Too little gives unstable froth and lost recovery. Too much gives excessive froth and lower concentrate grade."
]
],
"Mass pull": [
[
"What is mass pull?",
"The percentage of feed mass that reports to concentrate in flotation."
],
[
"Why is it important?",
"It trades off grade and recovery and sets the downstream load on UFG, thickening and concentrate leach."
],
[
"How is mass pull controlled?",
"Through air rate, froth depth, and reagent addition, often guided by the onstream analyser."
]
],
"Jameson": [
[
"What is a Jameson cell?",
"A flotation cell where slurry is pumped through a downcomer jet that entrains air, so no blower is needed."
],
[
"How does it differ from a tank cell?",
"Tank cells use agitators and blown air. Jameson cells use the pumped jet to make fine bubbles, giving compact high intensity flotation."
],
[
"Where are Jameson cells on this project?",
"Glossary area F18 covers cleaner and cleaner scavenger flotation using Jameson cells."
]
],
"OSA": [
[
"What is an OSA?",
"An onstream analyser that measures elemental assays of slurry streams in near real time, often via X ray fluorescence."
],
[
"Why does it matter?",
"It lets operators adjust flotation reagent dose and mass pull without waiting for lab assays."
],
[
"How does it get samples?",
"Through sampler systems that cut slurry from process streams and deliver it to the analyser."
]
],
"UFG": [
[
"What is UFG?",
"Ultra fine grinding of flotation concentrate in IsaMills to about 9 µm to expose gold locked in sulphides."
],
[
"Why grind so fine?",
"Gold locked in pyrite does not leach well. Fine grinding exposes it so cyanide leaching recovers more."
],
[
"Which areas cover UFG?",
"Glossary area F34 is the existing UFG 1 (IsaMill M3000), and F28 is the new UFG 2/3 (IsaMills M15,000)."
]
],
"TML": [
[
"What is TML?",
"Transportable moisture limit, the maximum moisture content at which a bulk cargo such as concentrate is considered safe to ship."
],
[
"Why does it matter?",
"Cargo above its TML can liquefy and shift during transport, so filtered concentrate moisture must stay below it."
],
[
"How is moisture controlled?",
"Mainly by filtration performance and testing of the product before dispatch."
]
],
"CIL": [
[
"What is CIL?",
"Carbon in leach, where gold is leached with cyanide and adsorbed onto activated carbon in the same tank train."
],
[
"How does CIL differ from CIP?",
"In CIL leaching and adsorption occur together. In CIP leaching is done first, then carbon is added in separate tanks."
],
[
"How does carbon move through CIL?",
"Carbon moves counter current to the slurry, retained by intertank screens and pumped forward to the elution circuit."
]
],
"CIL2 / CIL3": [
[
"What are CIL2 and CIL3?",
"Concentrate leach (CIL2) and concentrate adsorption (CIL3), the Stage 2 circuits treating ground concentrate."
],
[
"How do they differ from CIL4?",
"CIL2/3 treat UFG concentrate. CIL4 treats flotation tailings."
],
[
"Where are they in the app?",
"Glossary area F30 covers concentrate pre leach thickening, CIL2/3 and post leach thickening."
]
],
"CIL4": [
[
"What is CIL4?",
"The flotation tailings leach and adsorption circuit, recovering residual gold from flotation tails."
],
[
"Which areas relate to CIL4?",
"Glossary areas F21 (flotation tailings CIL4) and F22 (CIL4 carbon treatment and elution, regen kiln)."
],
[
"How does CIL4 differ from CIL2/3?",
"CIL4 handles the large tonnage, low grade tails. CIL2/3 handle the smaller concentrate stream."
]
],
"DO": [
[
"What is DO?",
"Dissolved oxygen in slurry, typically in mg/L, needed for cyanide leaching of gold."
],
[
"Why does DO matter?",
"Low DO slows gold dissolution. Oxygen injection raises DO to improve leach kinetics."
],
[
"How is DO measured?",
"By DO analysers in the leach tanks, and on this project the Carbon Scout also samples leach tanks for DO."
]
],
"Carbon Scout": [
[
"What is Carbon Scout?",
"A Gekko auto sampler that measures carbon concentration in grams per litre in each CIL tank."
],
[
"Why measure carbon per tank?",
"Even carbon distribution is key to adsorption. Uneven readings show carbon advance or screen problems."
],
[
"What does it measure here?",
"The app notes Carbon Scout MK6 samples all adsorption tanks for carbon g/L and leach tanks for DO, pH and solids."
]
],
"Loaded / barren carbon": [
[
"What is loaded carbon?",
"Activated carbon that has adsorbed gold in CIL and is ready for elution."
],
[
"What is barren carbon?",
"Carbon stripped of gold after elution, regenerated and returned to the CIL."
],
[
"How is loaded carbon removed?",
"It is pumped from the lead tank and screened, then sent to acid wash and elution."
]
],
"AARL": [
[
"What is AARL elution?",
"A method that strips gold from carbon by acid washing, pre soaking in caustic cyanide, then eluting with hot water."
],
[
"How does it differ from Zadra?",
"Zadra recirculates caustic cyanide solution continuously. AARL uses a fixed sequence with fresh hot water."
],
[
"What follows AARL?",
"The pregnant eluate goes to electrowinning, and the barren carbon is regenerated in a kiln."
]
],
"BV": [
[
"What is a bed volume?",
"One bed volume is the volume of solution equal to the volume of the carbon bed in the column. Flows through elution and acid wash columns are often quoted in BV or BV per hour so they scale with column size."
],
[
"Why are elution steps measured in bed volumes?",
"Stripping efficiency depends on how much solution passes through the carbon relative to its quantity. Quoting volumes in BV lets the sequence, tank sizes and pump flows be set consistently for any column."
],
[
"How many bed volumes does the CIL4 elution use?",
"The plant facts for CIL4 elution list 5 bed volumes of eluate. Check the elution sequence documents for the step by step volumes."
]
],
"Pregnant / lean / barren eluate": [
[
"What do pregnant, lean and barren mean for eluate?",
"Pregnant eluate is gold rich solution stripped from carbon and sent to electrowinning. Lean eluate is partly used solution reused for the next strip, and barren solution has had most of its gold removed."
],
[
"Where does each eluate go in the CIL4 split AARL circuit?",
"Pregnant eluate goes to the CIL4 eluate circulation tanks feeding electrowinning; once those are full, flow diverts to the lean eluate tank. Lean eluate is then used for the first elution stage of the next batch."
],
[
"How is barren eluate different from barren carbon?",
"Barren eluate is the stripped solution leaving electrowinning. Barren carbon is the carbon left after elution, which goes to the regeneration kiln before returning to the adsorption tanks."
]
],
"EW": [
[
"What is electrowinning?",
"Electrowinning passes direct current through pregnant eluate in cells so gold and silver plate out onto cathodes. The cathode sludge is then recovered, dried and smelted in the goldroom."
],
[
"Which EW circuits are on the project?",
"The plant facts list a new gravity EW for the intensive leach product and CIL4 EW with two split feed cells, fed by VSD pumps on flow control and run by sequence or manually."
],
[
"Where do I find EW equipment in the app?",
"Search for the EW cell or pump tag; the equipment page shows Details and related Instruments and Cables pills. The area code is the first part of the tag, for example F66 for EW and goldroom."
]
],
"Doré": [
[
"What is doré?",
"Doré is the bar of gold and silver alloy poured in the goldroom after smelting electrowinning sludge and gravity concentrate products. It is sent to a refinery for final purification."
],
[
"Why is doré not pure gold?",
"It contains silver and minor base metals that report with the gold through leaching and electrowinning. The refinery separates these, and payment is based on assayed contained gold and silver."
],
[
"Why is the goldroom treated differently on site?",
"It holds the plant's highest value product, so it has restricted access, security systems and strict procedures. Expect controlled entry and extra sign off for any work in the area."
]
],
"Regen": [
[
"What does the regen kiln do?",
"It heats barren carbon, in a low oxygen atmosphere, to burn off organic foulants and restore adsorption activity. The carbon is then quenched and returned to the adsorption tanks."
],
[
"Why does carbon need regeneration?",
"Acid washing removes inorganic scale but not organics such as oils, flotation reagents and humic material. Fouled carbon loads gold slowly, raising soluble losses to tails."
],
[
"How is the CIL4 regen kiln controlled?",
"The plant facts describe a Lochhead kiln package with screw feeder and vendor PLC, run in an overall regeneration sequence with quench tank and barren carbon pump. A mercury abatement system must run with the kiln."
]
],
"WAD CN": [
[
"What is WAD cyanide?",
"Weak acid dissociable cyanide is free cyanide plus cyanide bound in weak metal complexes such as zinc and copper, released at mildly acidic pH. It is the form regulated for wildlife and environmental toxicity."
],
[
"Why is WAD cyanide measured instead of total cyanide?",
"Strong complexes such as iron cyanide are much less toxic, so WAD gives a better measure of risk. Tailings and decant limits under the cyanide code are normally set as WAD."
],
[
"How is WAD cyanide controlled on this plant?",
"Hydrogen peroxide is added through inline mixers on the decant water lines, controlled by an online WAD cyanide analyser and flowmeters. The plant facts give a residual WAD target of about 1.5."
]
],
"TSF": [
[
"What is a TSF?",
"A tailings storage facility is the engineered impoundment where final process tailings are deposited and water is recovered as decant. It is a major regulated structure with ongoing monitoring."
],
[
"Which TSF does the plant feed?",
"The plant facts name Fim III under WBS T03. Final tails are pumped there by duty/duty/duty/standby tailings pumps, each line with flow, density and pressure measurement."
],
[
"How does the TSF link back to the plant water system?",
"Decant water returned from the TSF is cyanide water. It is treated with hydrogen peroxide for WAD cyanide and reused in the process."
]
],
"Scheme water": [
[
"What is scheme water?",
"Scheme water is fresh water supplied by pipeline, with SG 1.00. It is the cleanest water on site after potable and is used where saline water would cause problems."
],
[
"Where is scheme water used?",
"The plant facts list it for gland seals on the UFG mills and for the later elution and cooling steps in the CIL4 split AARL sequence. Uses are limited because it is costly compared with bore water."
],
[
"How is it different from process water?",
"Process water is saline bore water at SG about 1.07. Salt scales and corrodes equipment and harms elution, so fresh scheme water is used for those duties instead."
]
],
"Process water": [
[
"What is process water on this plant?",
"Saline bore water, SG about 1.07, used as the main water for grinding, flotation and slurry dilution. It is mainly recycled from the flotation tails thickener overflow."
],
[
"Why does the higher SG matter to a mechanical engineer?",
"Pump heads, power and line hydraulics must account for the higher density, and the salt content drives material selection and corrosion allowances for pipes, tanks and fittings."
],
[
"Where does process water come from?",
"The Process Water Tank is fed mainly by flotation tails thickener overflow, topped up from Bore Water Dam 2 (South Dam) by DOL saline pumps that trip on low low dam level."
]
],
"Cyanide water": [
[
"What is cyanide water?",
"Decant water returned from the TSF, which still carries residual cyanide. It is treated with hydrogen peroxide to lower WAD cyanide before reuse in the plant."
],
[
"Where is cyanide water used?",
"It is reused in cyanide tolerant parts of the circuit; for example the plant facts list cyanide water added to the CIL3 tails hopper. It should not go to flotation or clean water duties."
],
[
"What hazards does it carry?",
"It may release HCN gas if pH drops, and contact or spills must be managed as cyanide exposures. Treat its lines and tanks as cyanide service for isolation and PPE."
]
],
"Gland water": [
[
"What is gland water?",
"Clean, pressurised water injected into slurry pump gland packing. It flushes the seal, keeps slurry out and cools and lubricates the packing."
],
[
"Why does low gland flow stop a pump?",
"Without it the packing runs dry, overheats and slurry enters the seal, wearing the shaft sleeve. Low gland flow blocks a start and trips a running pump after a delay."
],
[
"How is gland water supplied and checked?",
"LP and HP gland water pumps draw from the lower part of the Raw Water Tank. Each pump has manual isolation, an actuated valve opened in the start sequence, a Maric constant flow valve and a flow switch or mag flowmeter."
]
],
"MoL": [
[
"What is milk of lime?",
"A slurry of slaked lime, calcium hydroxide, in water. It is dosed to raise and hold pH so cyanide stays as CN and does not form HCN gas."
],
[
"How is milk of lime made and distributed?",
"Quicklime is slaked in a vendor lime plant with slaking mills, cyclones and a scrubber, then stored in a milk of lime tank. A ringmain with duty/standby DOL pumps delivers it to users."
],
[
"How is lime dosing controlled in CIL4?",
"A pH controller on tank 1, with tank 2 as backup, opens the milk of lime valve at the CIL4 feed distribution box. Scale build up in lime lines and valves is a common maintenance issue."
]
],
"PSA": [
[
"What is a PSA oxygen plant?",
"Pressure swing adsorption passes compressed air through beds that adsorb nitrogen, leaving oxygen rich gas. Beds swing between high pressure adsorption and low pressure regeneration."
],
[
"Why do the leach circuits need oxygen?",
"Gold dissolution in cyanide consumes dissolved oxygen, and sulphide rich slurries use it quickly. Oxygen from the PSA plant, backed by liquid oxygen, supplies CIL2/3 and CIL4."
],
[
"What should I watch around oxygen systems?",
"Oxygen enriched atmospheres greatly increase fire risk, so oxygen piping needs cleaning for oxygen service and suitable materials. Keep oils and grease away from oxygen fittings."
]
],
"LPG": [
[
"What is LPG used for in CIL4?",
"It fuels the CIL4 elution heater, a fired package with a burner management system that heats the eluate for stripping gold from carbon. The eluate temperature controller sets firing."
],
[
"Why is the elution column pressurised?",
"Elution runs hot, and pressurising the column stops the solution flashing to steam. That keeps flow and heat transfer stable through the carbon bed."
],
[
"What safety points apply to LPG systems?",
"LPG is heavier than air and pools in low points, so hazardous area classification, gas detection and burner management interlocks matter. Work on the heater needs gas isolation and purging."
]
],
"PDC": [
[
"What is the PDC?",
"The process design criteria document sets the design basis: throughputs, ore properties, availabilities, design margins and key equipment duties. Other disciplines size equipment from it."
],
[
"Which PDC does the app draw on?",
"The app's plant facts are condensed from the Stage 2 Process Design Criteria 2000-F00-DCR-PR-10002 Rev 4. Those are design values, not live operating data."
],
[
"How does the PDC differ from the mass balance?",
"The PDC states criteria and assumptions; the SysCAD mass balance calculates the resulting stream flows and compositions. Both feed the PFDs and equipment datasheets."
]
],
"PFD": [
[
"What is a PFD?",
"A process flow diagram shows major equipment, main process streams and key operating conditions, usually with stream numbers linked to the mass balance. It omits most valves, instruments and line sizes."
],
[
"How do I use PFDs in the app?",
"PFDs open in the app's drawing viewer. Use them to understand flow paths between areas before going to the P&IDs for detail."
],
[
"How is a PFD different from a P&ID?",
"A PFD shows what the process does at overview level. A P&ID shows every line, valve, instrument and control loop needed to build and operate the plant."
]
],
"P&ID": [
[
"What is a P&ID?",
"A piping and instrumentation diagram shows each pipe with size and spec, valves, instruments, control loops, interlocks and equipment connections. It is the main design document for piping and controls."
],
[
"How do I find a P&ID in the app?",
"Equipment and instrument pages link to the relevant drawings, which open in the app's viewer. Documents not held in the app link to SharePoint."
],
[
"Why check the revision?",
"P&IDs change through design and construction, and only the current issued revision is valid for work. Confirm the revision before relying on line numbers, valves or tags."
]
],
"TQ": [
[
"What is a TQ?",
"A technical query is a formal question raised when design information is missing, unclear or conflicting. It records the question, proposed solution and the authorised response."
],
[
"Why raise a TQ instead of asking informally?",
"A TQ creates a traceable record and an approved answer that can change drawings or scope. Informal answers do not carry authority and are easily lost."
],
[
"When should a mechanical engineer raise one?",
"Raise one when drawings disagree, a vendor detail conflicts with the design, or an item cannot be built as shown. Include tags, drawing numbers and a suggested resolution."
]
],
"SysCAD": [
[
"What is SysCAD?",
"SysCAD is process simulation software used to build the plant mass and energy balance. It calculates flows, densities and compositions for each stream from the design criteria."
],
[
"How does it affect equipment design?",
"Pump, pipe and tank sizing start from SysCAD stream data, and PFD stream tables usually come from it. If the model changes, equipment duties may need rechecking."
],
[
"How is it different from the PDC?",
"The PDC sets the design inputs and assumptions. SysCAD uses them to calculate the balance; it does not replace the criteria."
]
],
"WBS": [
[
"What is a WBS?",
"A work breakdown structure divides the project into a hierarchy of scope packages for cost, schedule and document control. Codes identify which part of the project an item belongs to."
],
[
"What WBS codes appear on this project?",
"The plant facts list M mining, F FIM processing, T tailings (T03 Fim III TSF), N non process infrastructure (N02 Kaltails borefields) and P indirects."
],
[
"How is a WBS code different from an area code?",
"The WBS organises scope and cost; area codes like F16 locate equipment and form the first part of tags such as F16-AG-421. They are related but not the same."
]
],
"DCS": [
[
"What is the DCS?",
"The distributed control system runs plant control loops, interlocks and sequences. On this plant it is Yokogawa Centum VP with field control stations."
],
[
"How does the DCS relate to vendor PLCs?",
"Vendor packages such as the regen kiln, compressors and IsaMill starters have their own PLCs that report to the DCS. Major process equipment like the SAG, ball mill and flotation cells is DCS controlled."
],
[
"Why should mechanical engineers care about it?",
"Equipment starts, trips and permissives come from DCS logic. Understanding the interlocks helps diagnose why a machine will not start or keeps tripping."
]
],
"OIS": [
[
"What is the OIS?",
"The operator interface system is the set of control room screens where operators view the plant, start and stop equipment and change setpoints. It is the human interface to the DCS."
],
[
"What can only be done from the OIS?",
"Drive modes, Automatic, Manual and Local, are selected from the OIS only. Group start and stop sequences are also run from there."
],
[
"How is the OIS different from an LCS?",
"The OIS is in the control room. A local control station is a field pushbutton station beside the drive used for local start, stop and E-stop."
]
],
"CRO": [
[
"What does a CRO do?",
"The control room operator runs the plant from the OIS, watching alarms and trends, starting and stopping equipment and adjusting setpoints. They coordinate with field operators and maintenance."
],
[
"Why involve the CRO before field work?",
"The CRO controls drive modes and sequences and needs to know about isolations and testing. Confirming with them avoids unexpected starts and process upsets."
],
[
"What extra step applies to large drives?",
"The plant facts note there is no link to Parkeston Power Station, so the CRO phones for approval before starting mills. The sequence pauses for that confirmation."
]
],
"CrCR": [
[
"What is the CrCR?",
"The crusher control room, separate from the main mill control room. It runs the crushing area."
],
[
"Which equipment is run from the CrCR?",
"The plant facts state the new primary crusher PC2 is run from the existing crusher control room using CCTV. The rock breaker is also operated remotely by camera."
],
[
"How does it relate to the main control room?",
"Both use the same DCS. The CrCR focuses on crushing and truck dumping, while the main mill control building covers grinding onward."
]
],
"FCS": [
[
"What is an FCS?",
"A field control station is the Yokogawa DCS controller cabinet that holds processors and I/O and executes control logic for part of the plant. Field instruments and drives wire back to it, directly or through remote I/O."
],
[
"Why does FCS allocation matter?",
"Each FCS covers a group of equipment, so a fault or download on one affects only its area. Allocation also sets cable routes and marshalling."
],
[
"Is an FCS backed up?",
"The plant facts state UPS supplies the DCS and remote I/O, so controls keep running through short power interruptions."
]
],
"PI": [
[
"What is PI?",
"PI is the plant data historian that stores DCS values over time and shows them as trends. It is the main tool for reviewing what happened before a trip or upset."
],
[
"How can a mechanical engineer use PI?",
"Trend motor current, bearing temperatures, pressures and flows to spot wear, blockages or deteriorating performance. Comparing trends before and after a change shows its effect."
],
[
"How is PI different from the OIS?",
"The OIS shows live values for control. PI keeps long term history for analysis and reporting."
]
],
"Auto / Manual / Local": [
[
"What do the three drive modes mean?",
"Auto is DCS control, with LCS stop still working. Manual lets the CRO start and stop from the OIS and allows LCS start and stop. Local allows LCS start only and bypasses process interlocks and permissives."
],
[
"When is Local mode used?",
"Only for fault finding and maintenance, and it must be supervised. Critical interlocks still apply, and a timer returns the drive to its target mode."
],
[
"Who changes the mode?",
"Modes are selected from the OIS only, so the CRO sets them. Mode changes are bumpless."
]
],
"Critical interlock": [
[
"What is a critical interlock?",
"A safety trip such as an E-stop, pull wire or protection relay. It trips the drive in every mode, including Local, and cannot be bypassed."
],
[
"How does it differ from a process interlock?",
"A process interlock protects the process and trips only in Auto and Manual, and named users can bypass it. A critical interlock protects people and plant and always applies."
],
[
"How are critical interlocks usually implemented?",
"Typically hardwired into the starter or drive circuit, not relying only on DCS logic. For VSDs the E-stop goes to Safe Torque Off."
]
],
"Process interlock": [
[
"What is a process interlock?",
"A DCS trip that stops a drive in Auto and Manual to prevent spills, blockages or poor performance, for example stopping a feeder when the downstream conveyor stops."
],
[
"Can a process interlock be bypassed?",
"Yes, by named users individually, and Local mode also bypasses process interlocks. Bypasses should be controlled and recorded."
],
[
"How does it differ from a start permissive?",
"A process interlock trips a running drive. A start permissive only prevents starting."
]
],
"Start permissive": [
[
"What is a start permissive?",
"A condition that must be healthy before a drive can start, such as gland flow established or a valve in position. It does not trip the drive once running."
],
[
"Give an example on this plant.",
"Low gland water flow stops a slurry pump starting. Once running, low gland flow must persist for a set time before it trips the pump as a separate interlock."
],
[
"Why won't my pump start when nothing is tripped?",
"A permissive is probably not met. Check the OIS faceplate or the control philosophy for the list of start conditions."
]
],
"First out": [
[
"What is first out?",
"First out detection records which trip or alarm happened first when several occur together. The DCS has first out detection on trips."
],
[
"Why does it matter?",
"One trip often causes others downstream. The first out points to the root cause instead of the knock on alarms."
],
[
"Where would I see it?",
"On the OIS alarm or drive faceplate and in handover notes. PI trends help confirm the sequence of events."
]
],
"PV / SV / CV": [
[
"What do PV, SV and CV mean?",
"PV is the measured process variable, SV is the setpoint, and CV is the controller output, usually to a valve or VSD. Yokogawa uses SV where others say SP."
],
[
"How do I read a loop from them?",
"If PV tracks SV the loop is controlling. If CV is at 0 or 100 percent and PV still misses SV, the final element is saturated or faulty."
],
[
"Why are they useful for mechanical troubleshooting?",
"A valve at full output with low flow suggests a blocked line, worn pump or stuck valve. Trending them in PI shows when the problem started."
]
],
"Cascade": [
[
"What is cascade control?",
"A master controller's output becomes the setpoint of a slave controller. The slave reacts fast to local disturbances while the master holds the main variable."
],
[
"Where is cascade used on this plant?",
"Examples in the plant facts include cyclone feed hopper level to cyclone pressure setpoint, and thickener underflow from bed pressure or density to flow to VSD."
],
[
"What is cascade as a loop mode?",
"The plant facts list loop modes as Manual, Automatic and Cascade. In Cascade the slave takes its setpoint from the master instead of the operator."
]
],
"DOL": [
[
"What is a DOL starter?",
"A direct on line starter connects the motor straight to full supply voltage. It is simple and cheap but draws high starting current, typically several times full load."
],
[
"Where are DOL starters used?",
"Usually on small and medium motors where starting current and torque are acceptable. The plant facts list DOL pumps for reagents and the saline top up pumps."
],
[
"How does DOL compare with a VSD or soft starter?",
"DOL gives full speed only with a hard start. A soft starter limits starting current; a VSD also gives continuous speed control."
]
],
"EOL": [
[
"What is an electronic overload relay?",
"An electronic device in the starter that measures motor current and trips on overload, phase loss or imbalance. It replaces older thermal overloads."
],
[
"What extra does it provide on this plant?",
"The plant facts state LV DOL starters have electronic overloads on Modbus TCP, so current and trip data are available in the DCS."
],
[
"What does an overload trip tell a mechanical engineer?",
"The motor drew too much current for too long, often from a jammed or overloaded machine, failing bearings or a blocked pump. Check the mechanical side before resetting repeatedly."
]
],
"STO": [
[
"What is Safe Torque Off?",
"A safety input on a VSD that removes power to the motor so it cannot produce torque. It does not isolate the motor electrically."
],
[
"How is STO used on this plant?",
"The plant facts state VSD E-stops are wired to Safe Torque Off, making the E-stop a critical interlock independent of normal control."
],
[
"Is STO enough for maintenance isolation?",
"No. STO stops torque but the drive and motor terminals stay energised; use proper electrical isolation and lockout for work on equipment."
]
],
"Maric valve": [
[
"What is a Maric valve?",
"A constant flow valve with a flexible control element that holds a set flow over a range of upstream pressures. It is used on gland water lines."
],
[
"Why use it instead of a fixed orifice?",
"An orifice flow changes with supply pressure, while a Maric valve holds flow roughly constant. Each gland gets its intended water as header pressure varies."
],
[
"What problems show up with them?",
"Blockage or scale reduces flow, causing low gland flow alarms or trips. Check the flow switch and the valve during rounds."
]
],
"Dart valve": [
[
"What is a dart valve?",
"A tapered plug valve in a flotation cell discharge, raised or lowered by an actuator to control tailings outflow and hence pulp level and froth depth."
],
[
"How are they used on this plant?",
"The plant facts state two dart valves per cell on split range level control, arranged in series or parallel."
],
[
"What happens if one sticks?",
"Cell level rises or falls out of control, affecting froth and recovery, and may spill or starve downstream cells. Wear of the dart and seat is a regular maintenance item."
]
],
"Manta sub / SmartDiver": [
[
"What do these sensors measure?",
"They measure thickener bed level, the depth of the settled solids layer. This guides flocculant dosing and underflow control."
],
[
"How are they used in control?",
"In Stage 1 the flotation tails thickener flocculant was cascaded from Manta sub bed level. The vendor panel sends SmartDiver bed level to the DCS with rake torque and bed pressure."
],
[
"Why also measure bed pressure?",
"Bed pressure indicates bed mass, a different measure from level. Using both helps detect compacted or fluffy beds."
]
],
"Single stage": [
[
"What is single stage operation?",
"The SAG mill runs without the ball mill, usually during a ball mill reline. The SAG product goes straight to cyclones."
],
[
"How does it affect the plant?",
"Throughput and grind are usually reduced because the SAG does all the size reduction. Expect coarser product and changed circulating loads."
],
[
"Which reline scenarios exist?",
"The plant facts list new SAG single stage during ball mill reline, new SABC during FIM SAG reline, and FIM SAG plus new ball mill during new SAG reline."
]
],
"MCC": [
[
"What is an MCC?",
"A motor control centre is a switchboard with starters, protection and control for a group of motors. Each motor has its own module or cell."
],
[
"How do I find a motor's MCC in the app?",
"Open the equipment page and look under the Electrical band, and check the Cables pills. SLDs open in the app's viewer."
],
[
"What's the difference between an MCC and a DB?",
"An MCC starts and protects motors. A DB feeds lighting, small power and auxiliary circuits."
]
],
"HV / LV": [
[
"What do HV and LV mean here?",
"HV is above 1 kV. On this plant that is 33 kV at the incomers, then 11 kV and 3.3 kV distribution. LV is 415 V and 240 V."
],
[
"Which motors are HV?",
"Large drives are usually HV to keep current and cable sizes manageable. Check the equipment page Electrical band for the actual supply voltage."
],
[
"What changes when working on HV?",
"HV needs stricter permits, switching by authorised people and specific isolation and earthing. Never assume LV practice applies."
]
],
"VSD": [
[
"What is a VSD?",
"A variable speed drive controls motor speed by varying supply frequency and voltage. VSD tags use the suffix -VS."
],
[
"Why use a VSD?",
"It lets a pump, fan or conveyor match the process demand, saves energy and gives soft starting. Many control loops use the VSD speed as the controller output."
],
[
"What special considerations apply?",
"VSDs generate heat and harmonics, need cooling and their E-stop goes to Safe Torque Off. Motors may need insulated bearings against shaft currents."
]
],
"Soft starter": [
[
"What is a soft starter?",
"A device that ramps up motor voltage on start to limit inrush current and torque shock. Tags use the suffix -SS."
],
[
"How does it differ from a VSD?",
"A soft starter only controls starting and stopping, then the motor runs at full speed. A VSD controls speed continuously."
],
[
"Why choose a soft starter?",
"It is cheaper and simpler than a VSD when speed control is not needed, and it reduces mechanical stress on couplings, belts and gearboxes at start."
]
],
"DB": [
[
"What is a DB?",
"A distribution board feeds lighting, small power and auxiliary circuits through breakers. It is usually smaller than an MCC."
],
[
"Where do DBs get their supply?",
"Usually from a feeder on an MCC or main switchboard, often through a transformer for 240 V circuits."
],
[
"How does it show in the app?",
"DBs appear as electrical equipment with cables and drawings. SLDs open in the app's viewer."
]
],
"L&SP": [
[
"What is L&SP?",
"Lighting and small power: area lighting, general power outlets and minor loads. These circuits are normally fed from DBs."
],
[
"Why is it a separate scope?",
"It is designed and installed separately from motor power and instrumentation. Drawings and cable schedules are usually grouped under it."
],
[
"Where would I find L&SP details?",
"On the electrical layout drawings and DB schedules. Documents not in the app link to SharePoint."
]
],
"UPS": [
[
"What is a UPS?",
"An uninterruptible power supply keeps critical loads running from batteries during a power outage or disturbance."
],
[
"What does the UPS feed here?",
"The plant facts state UPS supplies the DCS and remote I/O, so controls and comms stay up during outages."
],
[
"How does a UPS differ from the emergency generator?",
"The UPS is instant but runs for a limited time on batteries. The generator takes time to start but supplies essential loads for longer."
]
],
"Essential / emergency switchboard": [
[
"What is an essential or emergency switchboard?",
"A switchboard kept alive by an emergency generator during a mains outage, supplying loads that must keep running."
],
[
"Which loads are on it?",
"Typically lube oil pumps, critical drainage, lighting and safety systems. Check the SLDs for the actual load list."
],
[
"How does the generator start?",
"The plant facts state the emergency generator starts automatically and the essential generator is started manually."
]
],
"Incomer": [
[
"What is an incomer?",
"The main supply breaker that connects a switchboard to its upstream source. Opening it de-energises the busbar."
],
[
"Why does the incomer matter for isolation?",
"It isolates the whole board, so it affects every feeder. Check which incomer feeds a board before planning outages."
],
[
"What range does the electrical SLD display cover?",
"The plant facts state the electrical SLD displays run from the 33 kV incomers to the 415 V MCC incomers."
]
],
"Feeder": [
[
"What is a feeder?",
"An outgoing circuit from a switchboard that supplies a load or another board, with its own breaker or starter."
],
[
"How does a feeder differ from an incomer?",
"The incomer brings power into the board. Feeders take power out to motors, DBs or other boards."
],
[
"Where do I see feeder details in the app?",
"Look under the Electrical band and Cables pills on the equipment page. SLDs show feeders and open in the app's viewer."
]
],
"Busbar": [
[
"What is a busbar?",
"A copper conductor bar inside a switchboard that the incomer and feeders connect to. It distributes power to all circuits on the board."
],
[
"Why is busbar rating important?",
"It must carry the full board current and withstand fault currents without damage. Ratings are on the switchboard datasheet and SLD."
],
[
"What hazard does a busbar present?",
"It is live whenever the incomer is closed and can carry high fault energy. Arc flash protection and full isolation are required before working near it."
]
],
"CB / ACB / MCCB": [
[
"What is the difference between an ACB and an MCCB?",
"An ACB is a large, usually withdrawable breaker used for incomers and big feeders. An MCCB is a smaller sealed breaker in a moulded case, used for outgoing feeders and motor circuits."
],
[
"Why does a breaker matter to a mechanical engineer?",
"It is what trips when a drive faults or overloads, and opening and locking it is part of isolating equipment before mechanical work."
],
[
"Where do I find which breaker feeds my equipment?",
"Open the equipment page and look under the Electrical band for the fed from board, then check the SLD in the app's viewer for the breaker on that circuit."
]
],
"ELR": [
[
"What does an earth leakage relay do?",
"It measures current leaking from a circuit to earth and trips the breaker or contactor when leakage exceeds its setting, protecting people and equipment."
],
[
"How is an ELR different from an overcurrent trip?",
"Overcurrent protection reacts to too much load current. An ELR reacts to a small imbalance caused by current going to earth, usually long before overcurrent would trip."
],
[
"What does an ELR trip usually point to?",
"Typically damaged cable insulation, water in a junction box or motor terminal box, or a winding fault. The circuit should be tested before resetting."
]
],
"FLC": [
[
"What is full load current?",
"The current a motor draws when delivering its rated output at rated voltage. It is on the motor nameplate and datasheet."
],
[
"Why does FLC matter?",
"Cables, overloads, breakers and VSDs are sized from it, and comparing running current against FLC shows how hard a machine is loaded."
],
[
"Is FLC the same as starting current?",
"No. A direct on line motor can draw several times FLC while starting. A VSD or soft starter limits that inrush."
]
],
"CT / VT": [
[
"What do CTs and VTs do?",
"They step high currents and voltages down to small standard values so meters and protection relays can measure them safely."
],
[
"Where do CTs and VTs show up on drawings?",
"They appear on SLDs and three line diagrams at incomers and feeders, connected to the protection relays and meters they serve."
],
[
"Why must a CT secondary never be left open circuit?",
"An open CT secondary under load can develop a dangerously high voltage. It must be shorted before a meter or relay is removed."
]
],
"NER": [
[
"What does a neutral earthing resistor do?",
"It connects a transformer neutral to earth through a resistance, limiting earth fault current to a level that is safe yet still detectable by protection."
],
[
"Why limit earth fault current?",
"Lower fault current reduces damage to cables, motors and switchgear and lowers the hazard during an earth fault, while still allowing protection to trip."
],
[
"How do I recognise an NER in the app?",
"Its tag uses NR after the area code, for example F16-NR-011, and it sits next to the transformer it serves on the SLD."
]
],
"ISL": [
[
"What is an isolator used for?",
"It is a local switch near a motor that lets the maintainer disconnect and lock off the supply before working on the drive or driven equipment."
],
[
"Is an isolator the same as a circuit breaker?",
"No. An isolator is not designed to interrupt fault current and is normally operated with the motor stopped. The breaker or starter provides protection."
],
[
"Does locking the isolator make the machine safe?",
"It removes electrical energy only. Stored mechanical, hydraulic or process energy must still be isolated under the site isolation procedure."
]
],
"JB": [
[
"What is a junction box?",
"A field enclosure where cables are joined or marshalled on terminals, for example many instrument cables combined into one multicore back to a panel."
],
[
"How do JBs show up in the app?",
"They appear in cable From and To fields and on termination diagrams, showing where field cables land before going on to a panel."
],
[
"What should I check on a JB in the field?",
"That it suits the location's IP rating, glands are sealed, it is labelled and it can be reached for maintenance."
]
],
"RIO": [
[
"What is a remote IO panel?",
"A field panel holding IO cards that wires up local instruments and sends the signals to the control system over a network, saving long multicore runs."
],
[
"How are RIO panels tagged?",
"Like other equipment, with the area code first, for example F16-RIO-001 for a remote IO panel in area F16."
],
[
"Why does it matter where instruments land?",
"Fault finding a signal means tracing the cable from the instrument to its RIO, then over the network. Instrument and cable pills on an equipment page help trace the route."
]
],
"RTU": [
[
"How is an RTU different from a RIO panel?",
"Both collect field signals, but an RTU suits remote sites and usually communicates by radio or telemetry, while a RIO uses a plant network cable."
],
[
"Where are RTUs used?",
"At outlying equipment such as tailings or water pumps where running a network or fibre cable back to the plant is impractical."
],
[
"What happens if the radio link drops?",
"Remote signals are lost or go stale in the control system, so loss of communications is normally alarmed and the remote equipment should fail to a safe state."
]
],
"FIP": [
[
"What is a fire indicator panel?",
"The panel that monitors smoke and heat detectors and manual call points, shows alarms by zone and triggers alarms or shutdowns."
],
[
"Why does a FIP matter to plant equipment?",
"A fire alarm can trip ventilation, HVAC or other equipment through interlocks, so it can explain an unexpected stop."
],
[
"How are FIPs tagged?",
"With the area code first and FIP as the type, for example F16-FIP-001."
]
],
"FOBOT": [
[
"What is a FOBOT?",
"A tray or enclosure where a fibre optic cable is terminated and broken out into individual fibres with connectors for patching."
],
[
"Where are FOBOTs found?",
"Usually in communications racks, switchrooms and RIO panels, at each end of a fibre link."
],
[
"Why handle them carefully?",
"Fibres are fragile and connectors are easily contaminated. Bent or dirty fibres can drop the network link to a panel."
]
],
"HIM": [
[
"What is a HIM on a VSD?",
"The keypad and display on a variable speed drive, used to view status, faults and parameters and sometimes to run the drive locally."
],
[
"Why would I use the HIM?",
"To read the active fault code, motor current and speed when diagnosing a trip at the drive."
],
[
"Should parameters be changed from the HIM?",
"Only by authorised personnel. Changes can affect protection and control, and should match the commissioned settings."
]
],
"HF": [
[
"What does a harmonic filter do?",
"It reduces the harmonic current distortion that VSDs and other electronic loads put on the supply, keeping voltage quality within limits."
],
[
"Why do VSDs need harmonic filtering?",
"Their rectifiers draw non sinusoidal current, which can overheat transformers and cables and disturb other equipment."
],
[
"How are harmonic filters tagged?",
"With the area code first and HF as the type, for example F16-HF-004."
]
],
"XE": [
[
"What is an earth electrode?",
"A conductive rod or stake driven into the ground that connects the earthing system to the general mass of earth."
],
[
"How does it relate to the earth bar?",
"Equipment earths bond to the earth bar, and the earth bar connects to electrodes and the earth grid, which provide the path into the ground."
],
[
"Why is it tested?",
"Earth resistance must be low enough for protection to operate and to limit touch voltages, so electrodes are tested at installation and periodically."
]
],
"Earth bar": [
[
"What is an earth bar?",
"A copper bar in a switchroom or panel where all equipment earthing conductors are bonded to a common point."
],
[
"How is it tagged?",
"With the area code first and EB as the type, for example F23-EB-601."
],
[
"Why does it matter?",
"A sound earth connection lets faults trip quickly and keeps exposed metal at safe potential. Loose or missing bonds are a safety defect."
]
],
"Arc flash": [
[
"What is arc flash?",
"A sudden release of heat, light and pressure when a fault arcs between conductors in switchgear. It can cause severe burns at a distance."
],
[
"What does an arc flash label tell me?",
"It gives the incident energy and the protective clothing and boundaries needed to work near that board while energised."
],
[
"How does it affect site work?",
"Work near live switchgear needs arc rated PPE and authorisation. Where possible, equipment is isolated so the hazard is removed."
]
],
"SLD": [
[
"What does a single line diagram show?",
"The power system with one line per three phase circuit: supplies, transformers, switchboards, breakers and loads, with ratings."
],
[
"How do I use an SLD?",
"To find which board and breaker feed a load and what else is on that board. SLDs open in the app's viewer."
],
[
"How is an SLD different from a schematic?",
"An SLD shows power distribution at a high level. A schematic shows the detailed control wiring of one circuit."
]
],
"Schematic (SCM)": [
[
"What does a schematic show?",
"The control wiring of one circuit, such as a motor starter: start and stop logic, interlocks, contacts, relays and terminal numbers."
],
[
"When would I use one?",
"When working out why a motor will not start or why an interlock tripped it, by following the control circuit."
],
[
"How does it differ from a termination diagram?",
"A schematic shows how the circuit works. A termination diagram shows which cable core lands on which terminal."
]
],
"TLD": [
[
"What does a three line diagram show?",
"All three phases drawn separately, so CT and VT connections, protection relays and metering can be shown clearly."
],
[
"Why not just use the SLD?",
"The SLD hides phase level detail. Protection and metering connections need each phase and the neutral drawn."
],
[
"Who uses TLDs?",
"Mainly electrical engineers and testers setting up and checking protection and metering."
]
],
"Termination diagram (TER)": [
[
"What does a termination diagram show?",
"For each cable, which core lands on which terminal at each end, so it can be installed and tested correctly."
],
[
"When is it useful?",
"During installation, loop checks and fault finding, when you need to know exactly where a wire lands in a panel or JB."
],
[
"How does it relate to the cable schedule?",
"The cable schedule lists each cable and its ends. The termination diagram details the core by core connections."
]
],
"Cable schedule": [
[
"What is a cable schedule?",
"A list of every cable with its number, from and to points, size, cores, length and route."
],
[
"How does it show up in the app?",
"Cables linked to equipment appear as Cables pills on the equipment page, showing where each cable runs."
],
[
"Why does it matter?",
"It drives cable ordering, pulling and termination, and is the first reference when tracing a supply or signal."
]
],
"Load list": [
[
"What is a load list?",
"A list of every electrical load with its rating and duty, used to size switchboards, MCCs, transformers and generators."
],
[
"Why does a mechanical engineer care?",
"Motor ratings come from mechanical equipment selections, so changing a pump or fan size changes the electrical load and may affect board sizing."
],
[
"How does it differ from the mechanical equipment list?",
"The equipment list describes the machines. The load list records their electrical demand and supply details."
]
],
"XLPE / PVC / EPR": [
[
"What are XLPE, PVC and EPR?",
"Cable insulation materials. XLPE is common for power cables, PVC for low voltage and control, and EPR for flexible or trailing cables."
],
[
"Why does insulation type matter?",
"It sets the maximum conductor temperature, which affects current rating, and governs flexibility and resistance to heat, oil and sunlight."
],
[
"Where would I see this?",
"In cable descriptions on the cable schedule and cable datasheets."
]
],
"CWS / SWA": [
[
"What is the difference between CWS and SWA?",
"CWS is a copper wire screen that carries earth fault current and screens the cable. SWA is steel wire armour that gives mechanical protection."
],
[
"Why does the metal layer matter?",
"It must be correctly earthed at the gland, and it decides where the cable can be buried or run without extra protection."
],
[
"Where do I see it?",
"In the cable description on the cable schedule."
]
],
"OSCN / IOSCN": [
[
"What is the difference between OSCN and IOSCN?",
"OSCN has one screen around all pairs. IOSCN also screens each pair individually, giving better protection against crosstalk and interference."
],
[
"Where are they used?",
"For instrument signals such as 4 to 20 mA loops. IOSCN suits multipair cables carrying sensitive analogue signals."
],
[
"How should screens be earthed?",
"Usually at one end only, normally the panel end, to avoid earth loops. The termination drawings show this."
]
],
"3C+E, 4C+E": [
[
"What does 3C+E mean?",
"Three power cores plus an earth conductor, typical for a three phase motor that needs no neutral."
],
[
"When is 4C+E used?",
"When the load needs a neutral as well as three phases, such as distribution boards serving single phase loads."
],
[
"Where does this appear?",
"In cable sizes on the cable schedule, together with the conductor size."
]
],
"0.6/1 kV, 1.9/3.3 kV": [
[
"What do the two voltages mean?",
"The first is the rated voltage from conductor to earth, the second from phase to phase."
],
[
"Which cable goes where?",
"0.6/1 kV cable suits low voltage circuits such as 415 V motors. 1.9/3.3 kV cable suits 3.3 kV systems."
],
[
"Can a higher rated cable be used on a lower voltage?",
"Generally yes, but it is larger and dearer. A lower rated cable must never be used above its rating."
]
],
"Trefoil": [
[
"What is trefoil formation?",
"Three single core cables of one circuit laid in a triangle and tied together along their length."
],
[
"Why lay cables in trefoil?",
"It balances inductance and heating between phases, reduces magnetic fields and holds the cables together under fault forces."
],
[
"What should I check on site?",
"That cleats are the correct type and spacing and that single core cables are not clamped with steel that forms a magnetic loop."
]
],
"Ladder": [
[
"What is ladder tray?",
"Open cable support made of two side rails joined by rungs, with cables tied to the rungs."
],
[
"Why use ladder rather than solid tray?",
"It is lighter, sheds dust and water, lets cables cool and is easy to tie down. Solid tray gives more support and protection."
],
[
"Why does it matter to a mechanical engineer?",
"Ladder routes need space and supports in steel structures and must clear equipment, piping and maintenance access."
]
],
"CAT6A": [
[
"What is CAT6A cable used for?",
"Ethernet data links, for example between network switches, control panels and workstations, over copper up to about 100 m."
],
[
"How does it differ from fibre?",
"CAT6A is copper and limited in distance. Fibre covers long distances and is immune to electrical interference."
],
[
"Why is it shielded?",
"Shielding reduces interference from nearby power cables and VSDs in an industrial plant."
]
],
"E&I": [
[
"What does E&I cover?",
"Electrical and instrumentation work: power, cabling, switchgear, instruments and control system hardware, installed and tested."
],
[
"Why does it matter to mechanical work?",
"Mechanical equipment is not complete until its motors and instruments are connected and tested by E&I, so interfaces need coordinating."
],
[
"How is it used on site?",
"As a contractor scope and as a team name, for example the E&I contractor or E&I commissioning."
]
],
"kVA / kVAr": [
[
"What is the difference between kW, kVA and kVAr?",
"kW is real power doing work, kVAr is reactive power used by magnetic fields, and kVA is the apparent power combining both."
],
[
"Why are transformers rated in kVA?",
"Their heating depends on current, whatever the power factor, so they are rated on apparent power."
],
[
"Why does kVAr matter?",
"Motors draw reactive power. High kVAr means a low power factor, larger currents and the need for correction."
]
],
"IP rating": [
[
"What does an IP rating mean?",
"Two digits: the first for protection against solids and dust, the second against water. IP66 is dust tight and resists powerful water jets."
],
[
"Where is IP20 acceptable?",
"Only inside a clean, dry enclosure or switchroom, where it just stops fingers touching live parts."
],
[
"Why does it matter on this site?",
"Field equipment faces dust and washdown, so motors, JBs and panels outdoors need a high enough rating."
]
],
"Space heater": [
[
"What does a space heater do?",
"It keeps a motor or panel slightly warmer than ambient while idle so condensation does not form on windings or electronics."
],
[
"When is it on?",
"Normally when the motor is stopped. It is interlocked to switch off when the motor runs."
],
[
"How is it tagged?",
"With SH as the type after the area code, for example F30-SH-63. Remember it may be live when the motor is isolated."
]
],
"Thermistor": [
[
"What does a motor thermistor do?",
"It senses winding temperature and, through a relay or the drive, trips the motor if the winding overheats."
],
[
"Why fit one when there is overload protection?",
"Overloads estimate heating from current. Thermistors catch overheating from poor cooling, high ambient or blocked air flow."
],
[
"What does a thermistor trip suggest?",
"Check cooling, ambient, load and starting frequency before restarting."
]
],
"Fed from": [
[
"What does fed from mean?",
"The switchboard, MCC or distribution board that supplies the load, and therefore where it is isolated."
],
[
"Where do I see it in the app?",
"Under the Electrical band on the equipment page, alongside other electrical data."
],
[
"Why is it useful?",
"It tells you which board to go to for isolation, and lets you find the circuit on the SLD in the app's viewer."
]
],
"Document number": [
[
"How do I read a document number?",
"2000 is the project, Fxx the area, then document type, discipline and sequence, for example 2000-F00-LST-ME-10001."
],
[
"What does F00 mean?",
"F00 is the general FIM site area, covering things like HV power, buried services and pipe racks, and is used for site wide documents."
],
[
"What if a document is not in the app?",
"The app links to SharePoint, where the document can be found by its number."
]
],
"PR / ME / PP / EL / IC": [
[
"What are these codes?",
"Discipline codes in document numbers: PR process, ME mechanical, PP piping, EL electrical and IC instrumentation and control."
],
[
"Where do they sit in the number?",
"After the document type, for example ME in 2000-F00-LST-ME-10001."
],
[
"Why does the discipline matter?",
"It tells you who owns the document and who to ask about its content or revisions."
]
],
"CV (document)": [
[
"What does CV mean in a document number?",
"Civil, covering earthworks, foundations, drainage, roads and concrete."
],
[
"Is CV a curriculum vitae or control valve here?",
"No. In a document number CV is the civil discipline code."
],
[
"When would a mechanical engineer need CV documents?",
"For equipment foundations, plinths, holding down bolts and bunds."
]
],
"ST (document)": [
[
"What does ST mean in a document number?",
"Structural, covering steel structures, platforms, walkways and supports."
],
[
"How does ST differ from CV?",
"CV covers civil works such as concrete and earthworks. ST covers structural steel and frames."
],
[
"When would I need ST documents?",
"For equipment supports, access platforms, monorails and the steel around a machine."
]
],
"GE (document)": [
[
"What does GE mean in a document number?",
"General, used for documents that do not belong to a single discipline."
],
[
"What kind of documents are GE?",
"Typically project wide items such as procedures, general specifications and overall reports."
],
[
"How does GE differ from F00?",
"GE is a discipline code meaning general. F00 is an area code for the general FIM site."
]
],
"LST / DRG / DSH / STS / STD": [
[
"What are these codes?",
"Document types: LST list, DRG drawing, DSH datasheet, STS specification and STD standard drawing."
],
[
"What is the difference between STS and STD?",
"STS is a written specification setting requirements. STD is a standard drawing showing a typical detail reused across the project."
],
[
"Where does the type code appear?",
"After the area code, for example LST in 2000-F00-LST-ME-10001."
]
],
"REP / DCR / TQY / BLK": [
[
"What are these codes?",
"Document types: REP report, DCR design criteria, TQY technical query and BLK block diagram."
],
[
"What is a technical query?",
"A formal question raised when information is unclear or conflicting, with the answer recorded so the decision can be traced."
],
[
"Why are design criteria important?",
"They set the basis of design, such as duties, margins and site conditions, that other documents follow."
]
],
"DN": [
[
"What does DN mean?",
"Diamètre nominal, the nominal pipe size in millimetres. DN150 is a nominal 150 mm pipe."
],
[
"Is DN the actual bore?",
"No. It is a size label. Actual outside and inside diameters depend on the pipe standard and wall thickness."
],
[
"Where does DN appear?",
"On P&IDs, in line numbers and on valve and equipment nozzle data."
]
],
"Pipe spec": [
[
"What is a pipe spec?",
"A piping class that sets the material, pressure rating, wall thickness, fittings, valves and gaskets for a line."
],
[
"Where is it shown?",
"As part of the line number on P&IDs, for example SS1 in 12-1606-COW-SS1-80."
],
[
"Why does it matter?",
"Using the wrong spec risks material incompatibility or under rating. Replacement parts must match the line's spec."
]
],
"Line number": [
[
"How is a line number built?",
"Area, sequence, service, spec and size. In 12-1606-COW-SS1-80, COW is cooling water, SS1 the spec and 80 the size."
],
[
"Where do I see line numbers?",
"On P&IDs, which open in the app's viewer, and in piping line lists."
],
[
"Why is it useful?",
"It identifies a line uniquely and tells you its service, material class and size at a glance."
]
],
"SPI": [
[
"What is a special piping item?",
"Anything in a line that is not standard pipe, fitting or valve, such as strainers, expansion joints, sight glasses or spray nozzles."
],
[
"Why are SPIs tracked separately?",
"They need their own datasheets and procurement, because the pipe spec does not cover them."
],
[
"Where would I see them?",
"On P&IDs, usually with their own SPI number, and in piping lists and datasheets."
]
],
"Spool": [
[
"What is a pipe spool?",
"A shop fabricated length of pipe with its fittings and flanges, made to an isometric drawing and installed as one piece."
],
[
"Why fabricate spools?",
"Shop work gives better weld quality and less site welding, which speeds installation."
],
[
"What should I check when spools arrive?",
"Spool number, dimensions, flange orientation, coatings and that NDE and test records are complete."
]
],
"Victaulic / Straub coupling": [
[
"What is the difference between these couplings?",
"A Victaulic coupling joins grooved pipe ends with a gasketed housing. A Straub coupling clamps onto plain pipe ends without grooves."
],
[
"Why use them?",
"They are quick to fit and remove, allow some movement and avoid site welding, which helps on slurry lines needing maintenance."
],
[
"What should I watch?",
"Pressure and temperature limits, gasket material for the service and the need for anchors, since they can allow axial movement."
]
],
"NDE": [
[
"What is NDE?",
"Testing of welds without damaging them, such as radiography, ultrasonic testing, dye penetrant or magnetic particle inspection."
],
[
"Why does it matter?",
"It finds cracks, porosity and lack of fusion before a line goes into service, and the extent is set by the code and pipe spec."
],
[
"How does it differ from a hydrotest?",
"NDE checks individual welds. A hydrotest pressure tests the whole assembled line for strength and leaks."
]
],
"HDPE": [
[
"What is HDPE pipe used for?",
"Water, slurry and tailings lines where corrosion and abrasion resistance and light weight matter."
],
[
"How is HDPE joined?",
"Usually by butt fusion or electrofusion welding, or with flanged stub ends to connect to steel pipe or equipment."
],
[
"What are its limits?",
"Lower pressure and temperature ratings than steel, greater thermal expansion and UV exposure must be allowed for in support design."
]
]
};
