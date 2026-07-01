import { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE V5 — Optimiseur de sciage réaliste en 4 FACES
// On scie 4 faces successives (rotation d'un quart de tour entre chaque). Chaque
// face : une dosse (chute) puis des rangées de produits parallèles à la face,
// avec cote de départ optimisée. Bloc central = plus gros produit. Cotes par face.
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg: "#1E2023", card: "#272B2F", accent: "#34C759", btn: "#2D6A4F",
  txt: "#E8ECEF", sec: "#8A9BB0", att: "#FF9F0A", prod: "#0A84FF",
  err: "#FF453A", line: "#3A4048",
};

const PROD_COLORS = ["#8CC63F", "#1B6E8C", "#F5A623", "#9B59F7", "#FF453A", "#5AC8FA", "#34C759", "#BF5AF2"];

const pf = (v) => parseFloat(String(v || "").replace(",", ".")) || 0;
const round = (n, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

const FACES = ["Haut", "Bas", "Gauche", "Droite"];

const initProduit = () => ({
  nom: "", essence: "", epaisseur: "", largeur: "", longueur: "", nbSouhaite: "",
});

function rayonA(xPos, L, rCulee, rFin) {
  if (L <= 0) return rFin;
  const t = Math.min(1, Math.max(0, xPos / L));
  return rCulee + (rFin - rCulee) * t;
}
// demi-corde du cercle de rayon R à distance d de l'axe
function demiCorde(R, d) {
  const a = R * R - d * d;
  return a <= 0 ? 0 : Math.sqrt(a);
}
function piecesDansLongueur(long, larg, trait) {
  if (larg <= 0 || long <= 0) return 0;
  return Math.max(0, Math.floor((long + trait) / (larg + trait)));
}

// ─────────────────────────────────────────────────────────────────────────────
// OPTIMISEUR 4 FACES
// Repère : cercle du duramen, rayon Ru, centré en (0,0).
// Chaque face avance depuis un bord vers le centre :
//   Haut   : depuis y=+Ru vers le bas   (produits horizontaux, largeur = corde en x)
//   Bas    : depuis y=-Ru vers le haut
//   Gauche : depuis x=-Ru vers la droite (produits verticaux, hauteur = corde en y)
//   Droite : depuis x=+Ru vers la gauche
// Sur une face, la 1re passe = dosse (on avance de "coteDepart" mm depuis le bord),
// puis on empile des rangées de produits (épaisseur + trait) tant qu'on est hors
// du bloc central. La cote de départ est optimisée par face pour max de volume.
// ─────────────────────────────────────────────────────────────────────────────
function optimiser({ diamCulee, diamFin, longueurGrumeM, traitMm, aubierMm, produits, objectif }) {
  const rCulee = pf(diamCulee) * 10 / 2;
  const rFin = pf(diamFin) * 10 / 2;
  const L = pf(longueurGrumeM) * 1000;
  const trait = pf(traitMm);
  const aubier = Math.max(0, pf(aubierMm));

  if (rFin <= 0) return null;
  const Ru = Math.max(0, rFin - aubier);           // duramen au fin bout (limitant)
  if (Ru <= 0) return null;

  const dispo = produits
    .map((p, i) => ({
      idx: i, nom: p.nom || `Produit ${i + 1}`, essence: p.essence,
      ep: pf(p.epaisseur), la: pf(p.largeur),
      ldM: pf(p.longueur) > 0 ? pf(p.longueur) : pf(longueurGrumeM),
      reste: p.nbSouhaite === "" ? Infinity : Math.max(0, Math.round(pf(p.nbSouhaite))),
      couleur: PROD_COLORS[i % PROD_COLORS.length],
    }))
    .filter((p) => p.ep > 0 && p.la > 0)
    .map((p, k) => ({ ...p, rank: k }));

  if (!dispo.length) return null;

  // ── Logique : débit en bandes horizontales symétriques (sciage en plots) ──
  // Bandes les plus ÉPAISSES au CENTRE, plus fines vers les bords (corde courte).
  const parEpaisseur = [...dispo].sort((a, b) => b.ep - a.ep);

  const compte = {};
  dispo.forEach((p) => (compte[p.idx] = 0));
  const pieces = [];

  const demiCordeH = (d) => demiCorde(Ru, Math.abs(d));

  function remplirBande(yHaut, yBas, p) {
    const yEval = Math.max(Math.abs(yHaut), Math.abs(yBas));
    const demi = demiCordeH(yEval);
    return { n: piecesDansLongueur(2 * demi, p.la, trait), demi };
  }

  // Empile une demi-pile depuis yDepart vers le haut (sens=+1) ou le bas (-1).
  function construireDemi(sens, yDepart) {
    const bandes = [];
    let y = yDepart;
    let garde = 0;
    while (Math.abs(y) < Ru && garde < 1000) {
      garde++;
      let best = null;
      for (const p of dispo) {
        const resteReel = objectif === "quantites" ? Math.max(0, p.reste - compte[p.idx]) : Infinity;
        if (objectif === "quantites" && resteReel <= 0) continue;
        const h = p.ep + trait;
        const yA = y, yB = y + sens * h;
        if (Math.abs(yB) > Ru) continue;
        const { n } = remplirBande(yA, yB, p);
        const nEff = objectif === "quantites" ? Math.min(n, resteReel) : n;
        if (nEff <= 0) continue;
        const score = (dispo.length - p.rank) * 1e12 + nEff * p.la * p.ep;
        if (!best || score > best.score) best = { p, n: nEff, yA, yB, h };
      }
      if (!best) { y += sens * Math.max(trait, 2); continue; }
      bandes.push(best);
      compte[best.p.idx] += best.n;
      y = best.yB;
    }
    return bandes;
  }

  // Produit le plus épais au centre (à cheval sur y=0)
  const central = parEpaisseur[0];
  const demiCentral = (central.ep + trait) / 2;

  const bandesCentre = [];
  {
    const { n } = remplirBande(demiCentral, -demiCentral, central);
    if (n > 0) {
      bandesCentre.push({ p: central, n, yA: demiCentral, yB: -demiCentral });
      compte[central.idx] += n;
    }
  }

  const bandesHaut = construireDemi(+1, demiCentral);
  const bandesBas = construireDemi(-1, -demiCentral);
  const toutesBandes = [...bandesBas.slice().reverse(), ...bandesCentre, ...bandesHaut];

  // Emprise horizontale du bloc central (bord droit du plus large empilement).
  // Les flancs gauche/droite au-delà de cette emprise sont encore exploitables.
  let demiLargeurBloc = 0;
  toutesBandes.forEach((b) => {
    const totalLong = b.n * b.p.la + (b.n - 1) * trait;
    demiLargeurBloc = Math.max(demiLargeurBloc, totalLong / 2);
  });

  // hauteur totale du bloc (du bas de la dernière bande basse au haut de la haute)
  let yMaxBloc = 0, yMinBloc = 0;
  toutesBandes.forEach((b) => {
    yMaxBloc = Math.max(yMaxBloc, b.yA, b.yB);
    yMinBloc = Math.min(yMinBloc, b.yA, b.yB);
  });

  // Génère les pièces des bandes horizontales (centre)
  toutesBandes.forEach((b) => {
    const yHaut = Math.max(b.yA, b.yB), yBas = Math.min(b.yA, b.yB);
    const yMid = (yHaut + yBas) / 2;
    const totalLong = b.n * b.p.la + (b.n - 1) * trait;
    for (let k = 0; k < b.n; k++) {
      const x = -totalLong / 2 + k * (b.p.la + trait) + b.p.la / 2;
      pieces.push({ x, y: yMid, w: b.p.la, h: b.p.ep, orient: "H",
        couleur: b.p.couleur, nom: b.p.nom, la: b.p.la, ep: b.p.ep });
    }
  });

  // ── FLANCS latéraux : on débite des pièces VERTICALES à gauche et à droite du
  // bloc central, dans l'espace restant jusqu'au cercle. Pièces couchées sur le
  // côté (épaisseur horizontale, largeur verticale). ──
  function debiterFlanc(sensX) {
    // sensX = +1 (droite) ou -1 (gauche). On avance depuis demiLargeurBloc vers Ru.
    let x = demiLargeurBloc;
    let garde = 0;
    while (x < Ru && garde < 500) {
      garde++;
      let best = null;
      for (const p of dispo) {
        const resteReel = objectif === "quantites" ? Math.max(0, p.reste - compte[p.idx]) : Infinity;
        if (objectif === "quantites" && resteReel <= 0) continue;
        // rangée verticale : épaisseur consommée horizontalement = ep + trait
        const w = p.ep + trait;
        const xExt = x + w;
        if (xExt > Ru) continue;
        // hauteur dispo = corde verticale du cercle à la distance x la plus éloignée
        const demiH = demiCorde(Ru, xExt);
        const n = piecesDansLongueur(2 * demiH, p.la, trait);
        const nEff = objectif === "quantites" ? Math.min(n, resteReel) : n;
        if (nEff <= 0) continue;
        const score = (dispo.length - p.rank) * 1e12 + nEff * p.la * p.ep;
        if (!best || score > best.score) best = { p, n: nEff, w, xInt: x, xExt, demiH };
      }
      if (!best) { x += Math.max(trait, 2); continue; }
      // place les n pièces verticales centrées sur y
      const totalH = best.n * best.p.la + (best.n - 1) * trait;
      const xMid = sensX > 0 ? (best.xInt + best.xExt) / 2 : -(best.xInt + best.xExt) / 2;
      for (let k = 0; k < best.n; k++) {
        const y = -totalH / 2 + k * (best.p.la + trait) + best.p.la / 2;
        pieces.push({ x: xMid, y, w: best.p.ep, h: best.p.la, orient: "V",
          couleur: best.p.couleur, nom: best.p.nom, la: best.p.la, ep: best.p.ep });
      }
      compte[best.p.idx] += best.n;
      x = best.xExt;
    }
    return Ru - x; // reste = distance non exploitée au bord (indicatif)
  }

  debiterFlanc(+1);
  debiterFlanc(-1);

  // ── Cotes de départ (distance du bord du duramen au 1er trait) sur 4 directions ──
  const cotes = {
    Haut: Math.round(Ru - yMaxBloc),
    Bas: Math.round(Ru - Math.abs(yMinBloc)),
    Droite: Math.round(Ru - demiLargeurBloc),
    Gauche: Math.round(Ru - demiLargeurBloc),
  };

  const surfaceSciee = pieces.reduce((s, pc) => s + pc.la * pc.ep, 0);
  const surfaceUtile = Math.PI * Ru * Ru;
  const rendement = surfaceUtile > 0 ? surfaceSciee / surfaceUtile : 0;

  const parProduit = dispo.map((p) => ({
    ...p, produit: compte[p.idx] || 0,
    estCentral: p.idx === central.idx,
    reste: p.reste === Infinity ? null : p.reste,
    manque: p.reste === Infinity ? 0 : Math.max(0, p.reste - (compte[p.idx] || 0)),
  }));

  return {
    rCulee, rFin, Ru, aubier, trait, longueurGrumeM: pf(longueurGrumeM),
    pieces, central, cotes, demiLargeurBloc, yMaxBloc, yMinBloc,
    rendement, surfaceSciee, parProduit,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// VUE SECTION 2D — coupe de la grume : cercle + pièces + cotes de départ
// ─────────────────────────────────────────────────────────────────────────────
function VueSection({ plan }) {
  if (!plan) return null;
  const { rFin, Ru, pieces, cotes, demiLargeurBloc, yMaxBloc, yMinBloc } = plan;
  const Rext = rFin;
  const pad = 48, size = 456;
  const scale = (size - 2 * pad) / (2 * Rext);
  const cx = size / 2, cy = size / 2;
  const toX = (x) => cx + x * scale;
  const toY = (y) => cy - y * scale;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: 470, display: "block", margin: "0 auto" }}>
      <circle cx={cx} cy={cy} r={rFin * scale} fill="#4a3d2c" stroke="#1E2023" strokeWidth="2" />
      <circle cx={cx} cy={cy} r={Ru * scale} fill="#3a2f24" stroke="#5a4a38" strokeWidth="1" />

      {pieces.map((pc, i) => (
        <g key={i}>
          <rect x={toX(pc.x - pc.w / 2)} y={toY(pc.y + pc.h / 2)}
            width={pc.w * scale} height={pc.h * scale}
            fill={pc.couleur} opacity="0.9" stroke="#1E2023" strokeWidth="0.6" rx="1" />
          {pc.w * scale > 26 && pc.h * scale > 11 && (
            <text x={toX(pc.x)} y={toY(pc.y)} fill="#0b0d0f"
              fontSize={Math.min(9, Math.min(pc.w, pc.h) * scale * 0.5)}
              textAnchor="middle" dominantBaseline="central" fontWeight="700"
              transform={pc.orient === "V" ? `rotate(-90 ${toX(pc.x)} ${toY(pc.y)})` : ""}>
              {pc.la}×{pc.ep}
            </text>
          )}
        </g>
      ))}

      {cotes && (
        <g>
          <line x1={toX(Ru * 0.35)} y1={toY(Ru)} x2={toX(Ru * 0.35)} y2={toY(yMaxBloc)} stroke={C.accent} strokeWidth="1.3" />
          <text x={toX(Ru * 0.35) + 5} y={toY((Ru + yMaxBloc) / 2)} fill={C.accent} fontSize="10" fontWeight="700" dominantBaseline="central">{cotes.Haut}</text>

          <line x1={toX(-Ru * 0.35)} y1={toY(-Ru)} x2={toX(-Ru * 0.35)} y2={toY(yMinBloc)} stroke={C.accent} strokeWidth="1.3" />
          <text x={toX(-Ru * 0.35) + 5} y={toY((-Ru + yMinBloc) / 2)} fill={C.accent} fontSize="10" fontWeight="700" dominantBaseline="central">{cotes.Bas}</text>

          <line x1={toX(Ru)} y1={toY(-Ru * 0.35)} x2={toX(demiLargeurBloc)} y2={toY(-Ru * 0.35)} stroke={C.accent} strokeWidth="1.3" />
          <text x={toX((Ru + demiLargeurBloc) / 2)} y={toY(-Ru * 0.35) - 5} fill={C.accent} fontSize="10" fontWeight="700" textAnchor="middle">{cotes.Droite}</text>

          <line x1={toX(-Ru)} y1={toY(Ru * 0.35)} x2={toX(-demiLargeurBloc)} y2={toY(Ru * 0.35)} stroke={C.accent} strokeWidth="1.3" />
          <text x={toX((-Ru - demiLargeurBloc) / 2)} y={toY(Ru * 0.35) - 5} fill={C.accent} fontSize="10" fontWeight="700" textAnchor="middle">{cotes.Gauche}</text>
        </g>
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VUE 3D — profil du tronc (culée→fin bout) avec longueurs de débit par produit.
// Vue de côté : chaque pièce apparaît à sa hauteur (y de la section) sur la
// longueur de son débit. Les débits courts s'arrêtent avant le fin bout.
// ─────────────────────────────────────────────────────────────────────────────
function Vue3D({ plan }) {
  if (!plan) return null;
  const { rCulee, rFin, Ru, longueurGrumeM, pieces } = plan;
  const Lmm = longueurGrumeM * 1000 || 1000;

  const size = 520, H = 220;
  const maxDia = Math.max(rCulee, rFin) * 2;
  const padX = 24, padTop = 20, padBot = 34;
  const sH = (size - 2 * padX) / Lmm;
  const sV = (H - padTop - padBot) / maxDia;

  const gx = (x) => padX + x * sH;
  const rAt = (x) => rCulee + (rFin - rCulee) * Math.min(1, x / Lmm);
  const midY = padTop + rCulee * sV;
  const topY = (x) => midY - rAt(x) * sV;
  const botY = (x) => midY + rAt(x) * sV;

  const N = 20;
  const xs = Array.from({ length: N + 1 }, (_, k) => (k / N) * Lmm);
  const topEdge = xs.map((x, k) => `${k ? "L" : "M"} ${gx(x)} ${topY(x)}`).join(" ");
  const botEdge = xs.slice().reverse().map((x) => `L ${gx(x)} ${botY(x)}`).join(" ");
  const grumePath = `${topEdge} ${botEdge} Z`;

  // pièces : on projette leur position y de la section sur le profil, et leur
  // longueur de débit sur x. On dessine seulement les pièces "horizontales"
  // pour lisibilité (celles dont la hauteur de section correspond à l'épaisseur).
  return (
    <svg viewBox={`0 0 ${size} ${H}`} width="100%" style={{ maxWidth: 520, display: "block", margin: "0 auto" }}>
      <path d={grumePath} fill="#4a3d2c" stroke="#6b5a45" strokeWidth="1.5" opacity="0.9" />
      {pieces.map((pc, i) => {
        const ld = Lmm; // longueur affichée = pleine longueur grume (approx par produit)
        const yC = midY - pc.y * sV;
        const hPx = Math.max(1.5, pc.h * sV);
        return (
          <rect key={i} x={gx(0)} y={yC - hPx / 2} width={gx(ld) - gx(0)} height={hPx}
            fill={pc.couleur} opacity="0.55" stroke="#1E2023" strokeWidth="0.3" />
        );
      })}
      <text x={gx(0)} y={H - 6} fill={C.sec} fontSize="10" textAnchor="middle">Culée ⌀{Math.round(rCulee * 2 / 10)}cm</text>
      <text x={gx(Lmm)} y={H - 6} fill={C.sec} fontSize="10" textAnchor="middle">Fin bout ⌀{Math.round(rFin * 2 / 10)}cm</text>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [diamCulee, setDiamCulee] = useState("45");
  const [diamFin, setDiamFin] = useState("40");
  const [longueur, setLongueur] = useState("6");
  const [trait, setTrait] = useState("4");
  const [aubier, setAubier] = useState("15");
  const [objectif, setObjectif] = useState("rendement");
  const [produits, setProduits] = useState([
    { nom: "Bastaing", essence: "Douglas", epaisseur: "27", largeur: "200", longueur: "4", nbSouhaite: "" },
    { nom: "Volige", essence: "Douglas", epaisseur: "27", largeur: "150", longueur: "4", nbSouhaite: "" },
    { nom: "Poutre", essence: "Douglas", epaisseur: "80", largeur: "220", longueur: "6", nbSouhaite: "1" },
  ]);

  const plan = useMemo(() => optimiser({
    diamCulee, diamFin, longueurGrumeM: longueur, traitMm: trait,
    aubierMm: aubier, produits, objectif,
  }), [diamCulee, diamFin, longueur, trait, aubier, produits, objectif]);

  const majProduit = (i, champ, val) =>
    setProduits((ps) => ps.map((p, k) => (k === i ? { ...p, [champ]: val } : p)));
  const ajouter = () => setProduits((ps) => [...ps, initProduit()]);
  const supprimer = (i) => setProduits((ps) => ps.filter((_, k) => k !== i));

  const S = {
    page: { background: C.bg, color: C.txt, minHeight: "100vh", fontFamily: "-apple-system,'Inter',sans-serif", padding: "20px 16px" },
    wrap: { maxWidth: 920, margin: "0 auto" },
    card: { background: C.card, borderRadius: 14, padding: 18, marginBottom: 16, border: `1px solid ${C.line}` },
    h1: { fontSize: 22, fontWeight: 700, margin: "0 0 4px" },
    sub: { color: C.sec, fontSize: 13, margin: "0 0 20px" },
    label: { display: "block", color: C.sec, fontSize: 12, marginBottom: 4, marginTop: 10 },
    input: { width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, color: C.txt, padding: "9px 10px", fontSize: 14 },
    row: { display: "flex", gap: 10, flexWrap: "wrap" },
    btnGhost: { background: "transparent", color: C.sec, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" },
    seg: (on) => ({ flex: 1, textAlign: "center", padding: "9px 8px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, background: on ? C.btn : C.bg, color: on ? "#fff" : C.sec, border: `1px solid ${on ? C.btn : C.line}` }),
    stat: { fontSize: 24, fontWeight: 700 },
    statL: { color: C.sec, fontSize: 12 },
    chip: { display: "flex", alignItems: "center", gap: 6, background: C.bg, borderRadius: 8, padding: "6px 10px", border: `1px solid ${C.line}`, fontSize: 13 },
  };

  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <h1 style={S.h1}>Schéma de sciage — 4 faces</h1>
        <p style={S.sub}>Prototype v5 · dosse + produits par face · bloc central · cotes par face</p>

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Grume</div>
          <div style={S.row}>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={S.label}>⌀ culée (cm)</label>
              <input style={S.input} value={diamCulee} onChange={(e) => setDiamCulee(e.target.value)} inputMode="decimal" />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={S.label}>⌀ fin bout (cm)</label>
              <input style={S.input} value={diamFin} onChange={(e) => setDiamFin(e.target.value)} inputMode="decimal" />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={S.label}>Longueur (m)</label>
              <input style={S.input} value={longueur} onChange={(e) => setLongueur(e.target.value)} inputMode="decimal" />
            </div>
          </div>
          <div style={S.row}>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={S.label}>Trait de scie (mm)</label>
              <input style={S.input} value={trait} onChange={(e) => setTrait(e.target.value)} inputMode="decimal" />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={S.label}>Épaisseur aubier (mm)</label>
              <input style={S.input} value={aubier} onChange={(e) => setAubier(e.target.value)} inputMode="decimal" />
            </div>
          </div>

          <label style={S.label}>Objectif</label>
          <div style={{ ...S.row, gap: 8 }}>
            <div style={S.seg(objectif === "rendement")} onClick={() => setObjectif("rendement")}>Rendement matière</div>
            <div style={S.seg(objectif === "quantites")} onClick={() => setObjectif("quantites")}>Respecter les quantités</div>
          </div>
        </div>

        <div style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontWeight: 600 }}>Produits</div>
            <button style={S.btnGhost} onClick={ajouter}>+ Ajouter</button>
          </div>
          <div style={{ color: C.sec, fontSize: 11, marginBottom: 6 }}>Le plus gros produit (section) devient le bloc central.</div>
          {produits.map((p, i) => (
            <div key={i} style={{ background: C.bg, borderRadius: 10, padding: 12, marginTop: 10, border: `1px solid ${C.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: PROD_COLORS[i % PROD_COLORS.length] }} />
                <span style={{ fontSize: 12, color: C.sec }}>Produit {i + 1}</span>
                {produits.length > 1 && (
                  <button style={{ ...S.btnGhost, marginLeft: "auto", padding: "4px 8px", color: C.err }} onClick={() => supprimer(i)}>Supprimer</button>
                )}
              </div>
              <div style={S.row}>
                <div style={{ flex: 2, minWidth: 110 }}>
                  <label style={S.label}>Nom</label>
                  <input style={S.input} value={p.nom} onChange={(e) => majProduit(i, "nom", e.target.value)} placeholder="Bastaing…" />
                </div>
                <div style={{ flex: 2, minWidth: 110 }}>
                  <label style={S.label}>Essence</label>
                  <input style={S.input} value={p.essence} onChange={(e) => majProduit(i, "essence", e.target.value)} placeholder="Douglas…" />
                </div>
              </div>
              <div style={S.row}>
                <div style={{ flex: 1, minWidth: 70 }}>
                  <label style={S.label}>Ép. (mm)</label>
                  <input style={S.input} value={p.epaisseur} onChange={(e) => majProduit(i, "epaisseur", e.target.value)} inputMode="decimal" />
                </div>
                <div style={{ flex: 1, minWidth: 70 }}>
                  <label style={S.label}>Larg. (mm)</label>
                  <input style={S.input} value={p.largeur} onChange={(e) => majProduit(i, "largeur", e.target.value)} inputMode="decimal" />
                </div>
                <div style={{ flex: 1, minWidth: 70 }}>
                  <label style={S.label}>Long. (m)</label>
                  <input style={S.input} value={p.longueur} onChange={(e) => majProduit(i, "longueur", e.target.value)} inputMode="decimal" placeholder="grume" />
                </div>
                <div style={{ flex: 1, minWidth: 70 }}>
                  <label style={S.label}>Nb</label>
                  <input style={S.input} value={p.nbSouhaite} onChange={(e) => majProduit(i, "nbSouhaite", e.target.value)} inputMode="numeric" placeholder="libre" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Schéma de sciage</div>
          {!plan ? (
            <p style={{ color: C.sec }}>Renseignez au moins un produit (épaisseur + largeur) et un diamètre fin bout valide.</p>
          ) : (
            <>
              <VueSection plan={plan} />

              {plan.cotes && (
                <div style={{ marginTop: 14, padding: 14, background: "#1b3a2a", borderRadius: 10, border: `1px solid ${C.accent}` }}>
                  <div style={{ fontWeight: 700, color: C.accent, marginBottom: 8 }}>Cotes de départ du 1ᵉʳ trait (depuis le bord hors aubier)</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {["Haut", "Bas", "Gauche", "Droite"].map((f) => (
                      <div key={f} style={{ background: C.bg, borderRadius: 8, padding: "8px 12px", fontSize: 13 }}>
                        <span style={{ color: C.accent, fontWeight: 700 }}>{f}</span>
                        <span style={{ color: C.txt, marginLeft: 8, fontWeight: 700 }}>{plan.cotes[f]} mm</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <div style={{ color: C.sec, fontSize: 12, textAlign: "center", marginBottom: 6 }}>Profil du tronc (longueur)</div>
                <Vue3D plan={plan} />
              </div>

              <div style={{ ...S.row, marginTop: 16, justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...S.stat, color: C.accent }}>{(plan.rendement * 100).toFixed(1)} %</div>
                  <div style={S.statL}>Rendement</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...S.stat, color: C.prod }}>{plan.pieces.length}</div>
                  <div style={S.statL}>Pièces</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ ...S.stat, color: C.att }}>{round(plan.pieces.reduce((s, pc) => s + pc.la * pc.ep * (plan.longueurGrumeM), 0) / 1e9, 3)}</div>
                  <div style={S.statL}>m³ (approx)</div>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                {plan.parProduit.map((p) => (
                  <div key={p.idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: p.couleur }} />
                    <span style={{ flex: 1 }}>
                      {p.nom} <span style={{ color: C.sec, fontSize: 12 }}>{p.la}×{p.ep}mm{p.estCentral ? " · bloc central" : ""}</span>
                    </span>
                    <span style={{ fontWeight: 600 }}>{p.produit}</span>
                    {p.reste !== null && (
                      <span style={{ fontSize: 12, color: p.manque > 0 ? C.att : C.accent }}>
                        / {p.reste} {p.manque > 0 ? `(manque ${p.manque})` : "✓"}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <p style={{ color: C.sec, fontSize: 11, textAlign: "center" }}>
          Prototype — sciage en 4 faces avec rotation. Cotes de dosse optimisées par face. Bloc central = plus gros produit.
        </p>
      </div>
    </div>
  );
}
