// ══════════════════════════════════════════════════════════
// FIRESTORE DATA OPERATIONS
// ══════════════════════════════════════════════════════════

// ── COUNTRIES ────────────────────────────────────────────
async function loadCountries() {
  try {
    const snapshot = await db.collection('countries').get();
    const countries = [];
    snapshot.forEach(doc => {
      countries.push({ id: doc.id, ...doc.data() });
    });
    return countries;
  } catch (err) {
    console.error('Error loading countries:', err);
    alert('Error loading countries: ' + err.message + '\nPlease check Firestore security rules.');
    return [];
  }
}

async function saveCountryDoc(countryId, data) {
  try {
    await db.collection('countries').doc(countryId).set(data, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving country:', err);
    return false;
  }
}

async function deleteCountryDoc(countryId) {
  try {
    await db.collection('countries').doc(countryId).delete();
    return true;
  } catch (err) {
    console.error('Error deleting country:', err);
    return false;
  }
}

// ── MACHINES (per country) ───────────────────────────────
async function loadMachinesForCountry(countryId, type) {
  try {
    const snapshot = await db.collection('countries').doc(countryId)
      .collection('machines').where('type', '==', type).get();
    const machines = [];
    snapshot.forEach(doc => {
      machines.push({ id: doc.id, ...doc.data() });
    });
    // Sort by order field if present, else by name
    machines.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    return machines;
  } catch (err) {
    console.error('Error loading machines:', err);
    return [];
  }
}

async function saveMachinesForCountry(countryId, type, machinesConfig) {
  try {
    const batch = db.batch();
    const colRef = db.collection('countries').doc(countryId).collection('machines');

    // Delete existing machines of this type
    const existing = await colRef.where('type', '==', type).get();
    existing.forEach(doc => batch.delete(doc.ref));

    // Write new machines
    machinesConfig.forEach((m, i) => {
      const docRef = colRef.doc(); // auto-ID
      batch.set(docRef, {
        ...m,
        type: type,
        order: i,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error('Error saving machines:', err);
    alert('Error saving machines: ' + err.message);
    return false;
  }
}

// ── MACHINE TEMPLATES (global) ───────────────────────────
async function loadMachineTemplates(type) {
  try {
    const snapshot = await db.collection('machineTemplates')
      .where('type', '==', type).get();
    const templates = [];
    snapshot.forEach(doc => {
      templates.push({ id: doc.id, ...doc.data() });
    });
    templates.sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
    return templates;
  } catch (err) {
    console.error('Error loading templates:', err);
    return [];
  }
}

async function saveMachineTemplate(templateData) {
  try {
    if (templateData.id) {
      const id = templateData.id;
      delete templateData.id;
      await db.collection('machineTemplates').doc(id).set(templateData, { merge: true });
      return id;
    } else {
      const docRef = await db.collection('machineTemplates').add({
        ...templateData,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      return docRef.id;
    }
  } catch (err) {
    console.error('Error saving template:', err);
    return null;
  }
}

async function deleteMachineTemplate(templateId) {
  try {
    await db.collection('machineTemplates').doc(templateId).delete();
    return true;
  } catch (err) {
    console.error('Error deleting template:', err);
    return false;
  }
}

// ── MATERIALS (per country) ──────────────────────────────
async function loadMaterialsForCountry(countryId) {
  try {
    const snapshot = await db.collection('countries').doc(countryId)
      .collection('materials').get();
    const materials = [];
    snapshot.forEach(doc => {
      materials.push({ id: doc.id, ...doc.data() });
    });
    return materials;
  } catch (err) {
    console.error('Error loading materials:', err);
    return [];
  }
}

async function uploadMaterialsToCountry(countryId, rows) {
  try {
    // Batch write (max 500 per batch)
    const colRef = db.collection('countries').doc(countryId).collection('materials');
    const batchSize = 450;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = db.batch();
      const chunk = rows.slice(i, i + batchSize);
      chunk.forEach(row => {
        const docRef = colRef.doc();
        batch.set(docRef, {
          ...row,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
          uploadedBy: currentUser ? currentUser.uid : ''
        });
      });
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error('Error uploading materials:', err);
    return false;
  }
}

async function deleteMaterialsForCountry(countryId) {
  try {
    const colRef = db.collection('countries').doc(countryId).collection('materials');
    const snapshot = await colRef.get();
    const batchSize = 450;
    const docs = [];
    snapshot.forEach(doc => docs.push(doc.ref));
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      docs.slice(i, i + batchSize).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
    return true;
  } catch (err) {
    console.error('Error deleting materials:', err);
    return false;
  }
}

// ── USERS (admin) ────────────────────────────────────────
async function loadAllUsers() {
  try {
    const snapshot = await db.collection('users').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push({ uid: doc.id, ...doc.data() });
    });
    return users;
  } catch (err) {
    console.error('Error loading users:', err);
    return [];
  }
}

// ── LOAD ALL APP DATA ────────────────────────────────────
async function loadAppData() {
  showLoadingOverlay('Loading data...');
  try {
    // Load countries
    const countries = await loadCountries();
    hoursData.length = 0;
    Object.keys(COUNTRY_DATA).forEach(k => delete COUNTRY_DATA[k]);

    for (const c of countries) {
      hoursData.push({
        id: c.id,
        country: c.name,
        hoursYear: c.hoursYear || 1824,
        hoursDay: c.hoursDay || 8,
        shifts: c.shifts || 1
      });

      // Load machines for this country
      const htMachines = await loadMachinesForCountry(c.id, 'ht');
      const pflMachines = await loadMachinesForCountry(c.id, 'pfl');

      // Build config arrays from Firestore data
      const htCfg = htMachines.map(m => ({
        name: m.name, nomSpeed: m.nomSpeed || 0, efficiency: m.efficiency || 90,
        accountVal: m.accountVal || 0, roiYears: m.roiYears || 8,
        maintAnnual: m.maintAnnual || 0, setupTime: m.setupTime || 0,
        sheetsSetup: m.sheetsSetup || 0, empCost: m.empCost || 0,
        socialPct: m.socialPct || 0, extraTime: m.extraTime || 0
      }));
      const pflCfg = pflMachines.map(m => ({
        name: m.name, nomSpeed: m.nomSpeed || 0, efficiency: m.efficiency || 90,
        accountVal: m.accountVal || 0, roiYears: m.roiYears || 8,
        maintAnnual: m.maintAnnual || 0, setupTime: m.setupTime || 0,
        metersSetup: m.metersSetup || 0, empCost: m.empCost || 0,
        socialPct: m.socialPct || 0, extraTime: m.extraTime || 0
      }));

      const elec = c.elec || { annualCost: 75900, nMachines: 40 };
      const hy = c.hoursYear || 1824;

      // Calculate derived machine values
      const htDerived = htCfg.map(m => {
        const calc = calcMachine(m, hy, elec);
        return { name: m.name, setup: calc.setupCost, oneHit: calc.oneHit, sheetsSetup: m.sheetsSetup };
      });
      const pflDerived = pflCfg.map(m => {
        const calc = calcMachine(m, hy, elec);
        return { name: m.name, setup: calc.setupCost, oneHit: calc.oneHit, metersSetup: m.metersSetup };
      });

      // Load materials for this country
      const materials = await loadMaterialsForCountry(c.id);

      COUNTRY_DATA[c.name] = {
        id: c.id,
        workingHours: hy,
        hoursDay: c.hoursDay || 8,
        shifts: c.shifts || 1,
        elec: elec,
        htMachines: htDerived,
        pflMachines: pflDerived,
        htMachinesConfig: htCfg,
        pflMachinesConfig: pflCfg,
        materials: materials
      };
    }

    refreshCountryDropdowns();
  } catch (err) {
    console.error('Error loading app data:', err);
    alert('Error loading data. Please refresh the page.');
  } finally {
    hideLoadingOverlay();
  }
}

// ── SEED INITIAL DATA ────────────────────────────────────
// One-time function to seed Portugal/Spain/UK data into Firestore
async function seedInitialData() {
  if (!currentUser || currentUser.role !== 'admin') {
    alert('Only admin can seed data.');
    return;
  }
  if (!confirm('This will create initial countries and machines in the database. Continue?')) return;

  showLoadingOverlay('Seeding data...');
  try {
    // Default countries
    const defaultCountries = [
      { name: 'Portugal', hoursYear: 1824, hoursDay: 8, shifts: 1, elec: { annualCost: 75900, nMachines: 40 } },
      { name: 'Spain', hoursYear: 1800, hoursDay: 8, shifts: 1, elec: { annualCost: 75900, nMachines: 40 } },
      { name: 'UK', hoursYear: 1760, hoursDay: 8, shifts: 1, elec: { annualCost: 75900, nMachines: 40 } }
    ];

    for (const c of defaultCountries) {
      // Check if country already exists
      const existing = await db.collection('countries').where('name', '==', c.name).get();
      if (!existing.empty) { console.log(c.name + ' already exists, skipping'); continue; }

      const docRef = await db.collection('countries').add(c);

      // Seed HT machines for this country
      for (let i = 0; i < DEFAULT_HT_CONFIG.length; i++) {
        await db.collection('countries').doc(docRef.id).collection('machines').add({
          ...DEFAULT_HT_CONFIG[i], type: 'ht', order: i
        });
      }
      // Seed PFL machines for this country
      for (let i = 0; i < DEFAULT_PFL_CONFIG.length; i++) {
        await db.collection('countries').doc(docRef.id).collection('machines').add({
          ...DEFAULT_PFL_CONFIG[i], type: 'pfl', order: i
        });
      }
      console.log('Seeded:', c.name);
    }

    alert('Initial data seeded successfully. The page will reload.');
    location.reload();
  } catch (err) {
    console.error('Seed error:', err);
    alert('Error seeding data: ' + err.message);
  } finally {
    hideLoadingOverlay();
  }
}
