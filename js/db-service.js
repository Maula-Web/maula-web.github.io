class DataService {
    constructor() {
        this.db = window.db;
        this.collections = {
            members: 'members',
            jornadas: 'jornadas',
            pronosticos: 'pronosticos',
            logs: 'logs',
            config: 'config',
            docs: 'documents'
        };
    }

    async init() {
        console.log("DataService: Checking connection...");
        try {
            await this.migrateIfNeeded();
            console.log("DataService: Ready.");
        } catch (e) {
            console.error("DataService Error:", e);
            alert("Error conectando con la base de datos.");
        }
    }

    // --- MIGRATION UTILS ---
    async migrateIfNeeded() {
        await this.migrateCollection('members', 'maulas_members');
        await this.migrateCollection('jornadas', 'maulas_jornadas');
        await this.migrateCollection('pronosticos', 'maulas_pronosticos');
        await this.migrateCollection('logs', 'maulas_logs');
        await this.migrateCollection('docs', 'maulas_docs');

        // 1. Members Check - PROTECT AGAINST OVERWRITING
        const memSnap = await this.db.collection('members').get();
        if (memSnap.empty) {
            console.log("DB: Seeding defaults...");
            await this.seedDefaults();
        }

        // 2. Jornadas/Data Check (For initial fill from static)
        const jorSnap = await this.db.collection('jornadas').limit(1).get();
        if (jorSnap.empty) {
            console.log("DB: Seeding FULL DATA from static files...");
            // Load scripts dynamically if not present
            if (!window.CloudSeeder) {
                await this.loadScript('js/data_loader.js');
                await this.loadScript('js/cloud-seeder.js');
            }
            if (window.CloudSeeder) {
                await window.CloudSeeder.run(this);
                alert("¡Datos iniciales cargados (Jornadas y Pronósticos)!");
            }
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    async seedDefaults() {
        // RADICAL PROTECTION: If there's any member, stop completely.
        const memSnap = await this.db.collection('members').get();
        if (!memSnap.empty) {
            console.log("DB: Members already exist, skipping seed.");
            return;
        }

        const names = [
            "Alvaro", "Carlos", "David Buzón", "Edu", "Emilio",
            "Fernando Lozano", "Fernando Ramírez", "Heradio", "JA Valdivieso", "Javier Mora",
            "Juan Antonio", "Juanjo", "Luismi", "Marcelo", "Martín",
            "Rafa", "Ramón", "Raúl Romera", "Samuel"
        ];

        const batch = this.db.batch();
        let id = 1;

        for (const name of names) {
            const cleanName = name.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-z0-9]/g, "");

            const email = `${cleanName}@maulas.com`;

            const docRef = this.db.collection('members').doc(String(id));
            batch.set(docRef, {
                id: id,
                name: name,
                email: email,
                phone: '',
                tgNick: '', // Initialize new field
                joinedDate: new Date().toISOString()
            });
            id++;
        }
        await batch.commit();
        console.log("Seeded default members successfully.");
    }

    async migrateCollection(colName, localKey) {
        const snap = await this.db.collection(colName).limit(1).get();
        if (!snap.empty) return; // Already data

        const localData = JSON.parse(localStorage.getItem(localKey) || '[]');
        if (localData.length === 0) return;

        console.log(`Migrating ${colName} to cloud...`);
        const batch = this.db.batch();
        let count = 0;

        // Batches limit is 500
        for (const item of localData) {
            let docId = item.id ? String(item.id) : null;
            if (!docId) docId = this.db.collection(colName).doc().id;

            const ref = this.db.collection(colName).doc(docId);
            batch.set(ref, item);
            count++;
            if (count >= 490) break; // Simple safety mechanism for batch size
        }
        await batch.commit();
        console.log(`Migrated ${count} items to ${colName}.`);
    }

    // --- CRUD WRAPPERS ---

    // Generic Get All
    async getAll(collectionName) {
        const snap = await this.db.collection(collectionName).get();
        return snap.docs.map(doc => doc.data());
    }

    async getDoc(collectionName, docId) {
        const doc = await this.db.collection(collectionName).doc(String(docId)).get();
        return doc.exists ? doc.data() : null;
    }

    // Generic Add/Update (Upsert)
    async save(collectionName, item) {
        if (!item.id) item.id = Date.now();
        await this.db.collection(collectionName).doc(String(item.id)).set(item);
    }

    // Generic Delete
    async delete(collectionName, id) {
        await this.db.collection(collectionName).doc(String(id)).delete();
    }

    // Config Specific
    async getConfig() {
        // Scoring rules
        const doc = await this.db.collection('config').doc('scoring').get();
        if (doc.exists) return doc.data();
        return null;
    }

    async saveConfig(rules) {
        await this.db.collection('config').doc('scoring').set(rules);
    }

    // Auth Helpers
    async logAction(user, action) {
        const log = {
            id: Date.now(),
            user,
            action,
            date: new Date().toISOString()
        };
        await this.save(this.collections.logs, log);
    }
}

window.DataService = new DataService();
