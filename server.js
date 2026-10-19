const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configuración de Supabase
const SUPABASE_URL = 'https://lldwbjkvpuriokfobprs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qeHL1fkMuIzBTe_YQ9lOnQ_5tHAV04-';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Obtener todos los ingresos
app.get('/api/ingresos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('ingresos_revoltura')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (err) {
        console.error("Error al obtener ingresos:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 2. Registrar un nuevo ingreso
app.post('/api/ingresos', async (req, res) => {
    const { fecha, granja, producto, totalLlegada, basesSucias, cantidadUtil, siniestros } = req.body;

    try {
        const { data, error } = await supabase
            .from('ingresos_revoltura')
            .insert([{ 
                fecha, 
                granja, 
                producto: producto || 'Revoltura', 
                total_llegada: totalLlegada, 
                bases_sucias: basesSucias, 
                cantidad_util: cantidadUtil,
                siniestros: Number(siniestros) || 0 
            }]);

        if (error) throw error;
        res.json({ success: true, message: 'Ingreso registrado correctamente', data });
    } catch (err) {
        console.error("Error al guardar ingreso:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3. Eliminar registro completo (Celda / Fila)
app.delete('/api/ingresos', async (req, res) => {
    const { fecha, granja } = req.query;

    try {
        if (!fecha || !granja) {
            return res.status(400).json({ error: 'Faltan parámetros: fecha y granja son obligatorios.' });
        }

        let granjaLimpia = granja;
        if (granja && granja.includes(' - ')) {
            granjaLimpia = granja.split(' - ')[1].trim();
        }

        // 1. Eliminar de la tabla principal de ingresos
        const { error: errIngresos } = await supabase
            .from('ingresos_revoltura')
            .delete()
            .eq('fecha', fecha)
            .eq('granja', granjaLimpia);

        if (errIngresos) throw errIngresos;

        // 2. Limpiar también los registros relacionados para eliminar toda la celda por completo
        await supabase
            .from('huevos_recuperados')
            .delete()
            .eq('fecha', fecha)
            .eq('granja', granjaLimpia);

        await supabase
            .from('huevos_a_lavar')
            .delete()
            .eq('fecha', fecha)
            .eq('granja', granjaLimpia);

        res.json({ success: true, message: 'Registro completo eliminado correctamente' });
    } catch (err) {
        console.error("Error al eliminar:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 3.1 Actualizar un registro existente
app.put('/api/ingresos', async (req, res) => {
    const { id, fecha, fechaOriginal, granja, cantidadUtil, basesSucias, siniestros, huevoRecuperado, sucioALavar } = req.body;

    try {
        let granjaLimpia = granja;
        if (granja && granja.includes(' - ')) {
            granjaLimpia = granja.split(' - ')[1].trim();
        }

        const fechaBusqueda = fechaOriginal || fecha;

        const { data: ingresoExistente, error: errBuscaIngreso } = await supabase
            .from('ingresos_revoltura')
            .select('*')
            .eq('granja', granjaLimpia)
            .eq('fecha', fechaBusqueda);

        if (errBuscaIngreso) throw errBuscaIngreso;

        if (ingresoExistente && ingresoExistente.length > 0) {
            await supabase
                .from('ingresos_revoltura')
                .update({
                    fecha: fecha,
                    cantidad_util: Number(cantidadUtil) || 0,
                    total_llegada: Number(cantidadUtil) || 0,
                    bases_sucias: Number(basesSucias) || 0,
                    siniestros: Number(siniestros) || 0
                })
                .eq('id', ingresoExistente[0].id);
        } else {
            await supabase
                .from('ingresos_revoltura')
                .insert([{
                    fecha: fecha,
                    granja: granjaLimpia,
                    producto: 'Revoltura',
                    cantidad_util: Number(cantidadUtil) || 0,
                    total_llegada: Number(cantidadUtil) || 0,
                    bases_sucias: Number(basesSucias) || 0,
                    siniestros: Number(siniestros) || 0
                }]);
        }

        // Huevo Recuperado
        const { data: recExistente, error: errBusquedaRec } = await supabase
            .from('huevos_recuperados')
            .select('*')
            .eq('granja', granjaLimpia)
            .eq('fecha', fechaBusqueda);

        if (errBusquedaRec) throw errBusquedaRec;
        const valorHuevoRecup = Number(huevoRecuperado) || 0;

        if (recExistente && recExistente.length > 0) {
            if (valorHuevoRecup > 0) {
                await supabase.from('huevos_recuperados').update({ fecha: fecha, cantidad_recuperada: valorHuevoRecup }).eq('id', recExistente[0].id);
            } else {
                await supabase.from('huevos_recuperados').delete().eq('id', recExistente[0].id);
            }
        } else if (valorHuevoRecup > 0) {
            await supabase.from('huevos_recuperados').insert([{ fecha: fecha, granja: granjaLimpia, cantidad_recuperada: valorHuevoRecup }]);
        }

        // Sucio a Lavar
        const { data: lavarExistente, error: errBusquedaLavar } = await supabase
            .from('huevos_a_lavar')
            .select('*')
            .eq('granja', granjaLimpia)
            .eq('fecha', fechaBusqueda);

        if (errBusquedaLavar) throw errBusquedaLavar;
        const valorLavarNum = Number(sucioALavar) || 0;

        if (lavarExistente && lavarExistente.length > 0) {
            if (valorLavarNum > 0) {
                await supabase.from('huevos_a_lavar').update({ fecha: fecha, cantidad_lavada: valorLavarNum }).eq('id', lavarExistente[0].id);
            } else {
                await supabase.from('huevos_a_lavar').delete().eq('id', lavarExistente[0].id);
            }
        } else if (valorLavarNum > 0) {
            await supabase.from('huevos_a_lavar').insert([{ fecha: fecha, granja: granjaLimpia, cantidad_lavada: valorLavarNum }]);
        }

        res.json({ success: true, message: 'Registro actualizado correctamente' });
    } catch (err) {
        console.error("Error al actualizar el registro:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 4. Registrar una Salida
app.post('/api/salidas', async (req, res) => {
    const { tipo, cantidad, fechaBases, granja, basesGeneradas, fechaRecuperado, valorRecuperado } = req.body; 

    try {
        if (!granja || !fechaBases) {
            return res.status(400).json({ error: 'Faltan parámetros obligatorios (granja o fecha).' });
        }
        const cantidadDescontar = parseInt(cantidad);
        const extraBases = parseInt(basesGeneradas) || 0;
        let granjaLimpia = granja.includes(' - ') ? granja.split(' - ')[1].trim() : granja;

        if (tipo === 'revoltura' && fechaRecuperado && Number(valorRecuperado) > 0) {
            const numeroValorRecup = parseInt(valorRecuperado);
            
            let fechaRecupLimpia = String(fechaRecuperado);
            const matchFecha = fechaRecupLimpia.match(/\d{4}-\d{2}-\d{2}/);
            if (matchFecha) fechaRecupLimpia = matchFecha[0];

            const { data: recRegistros, error: errBuscaRec } = await supabase
                .from('huevos_recuperados')
                .select('*')
                .eq('granja', granjaLimpia)
                .eq('fecha', fechaRecupLimpia);

            if (errBuscaRec || !recRegistros || recRegistros.length === 0) {
                return res.status(404).json({ error: `No se encontró el registro de huevo recuperado para la fecha ${fechaRecupLimpia}.` });
            }

            const disponibleRecup = recRegistros.reduce((sum, r) => sum + (Number(r.cantidad_recuperada) || 0), 0);

            if (numeroValorRecup > disponibleRecup) {
                return res.status(400).json({ error: `La cantidad a descontar (${numeroValorRecup}) supera el total disponible en recuperados (${disponibleRecup}).` });
            }

            let restoADescontar = numeroValorRecup;
            for (const reg of recRegistros) {
                if (restoADescontar <= 0) break;
                const actual = Number(reg.cantidad_recuperada) || 0;
                if (actual <= restoADescontar) {
                    restoADescontar -= actual;
                    await supabase.from('huevos_recuperados').delete().eq('id', reg.id);
                } else {
                    const nuevoSaldo = actual - restoADescontar;
                    restoADescontar = 0;
                    await supabase.from('huevos_recuperados').update({ cantidad_recuperada: nuevoSaldo }).eq('id', reg.id);
                }
            }
        }

        if (tipo === 'revoltura' && cantidadDescontar > 0) {
            const { data: registros, error: errBusqueda } = await supabase
                .from('ingresos_revoltura')
                .select('*')
                .eq('granja', granjaLimpia)
                .eq('fecha', fechaBases)
                .order('id', { ascending: false });

            if (errBusqueda || !registros || registros.length === 0) {
                return res.status(404).json({ error: 'No se encontraron registros de revoltura para esta granja en la fecha seleccionada.' });
            }

            let restoADescontarUtil = cantidadDescontar;
            let basesPorAsignar = extraBases;

            for (const reg of registros) {
                if (restoADescontarUtil <= 0) break;
                const utilActual = reg.cantidad_util || 0;
                let descuentoEnEsteRegistro = utilActual >= restoADescontarUtil ? restoADescontarUtil : utilActual;
                
                restoADescontarUtil -= descuentoEnEsteRegistro;
                const nuevaCantidadUtil = utilActual - descuentoEnEsteRegistro;
                const nuevoTotalLlegada = Math.max(0, (reg.total_llegada || 0) - descuentoEnEsteRegistro);

                await supabase.from('ingresos_revoltura').update({ cantidad_util: nuevaCantidadUtil, total_llegada: nuevoTotalLlegada }).eq('id', reg.id);
            }

            if (basesPorAsignar > 0) {
                const registroDestino = registros[0]; 
                const nuevasBases = (registroDestino.bases_sucias || 0) + basesPorAsignar;
                await supabase.from('ingresos_revoltura').update({ bases_sucias: nuevasBases }).eq('id', registroDestino.id);
            }
        } else if (tipo === 'bases') {
            const { data: registros, error: errBusqueda } = await supabase
                .from('ingresos_revoltura')
                .select('*')
                .eq('granja', granjaLimpia)
                .eq('fecha', fechaBases)
                .order('id', { ascending: false });

            if (errBusqueda || !registros || registros.length === 0) {
                return res.status(404).json({ error: 'No se encontraron registros de bases para esta granja en la fecha.' });
            }

            let restoADescontar = cantidadDescontar;
            for (const reg of registros) {
                if (restoADescontar <= 0) break;
                const basesActuales = reg.bases_sucias || 0;
                let nuevasBases = basesActuales >= restoADescontar ? basesActuales - restoADescontar : 0;
                restoADescontar -= basesActuales;
                await supabase.from('ingresos_revoltura').update({ bases_sucias: nuevasBases }).eq('id', reg.id);
            }
        } else if (tipo === 'siniestros') {
            const { data: registros, error: errBusqueda } = await supabase
                .from('ingresos_revoltura')
                .select('*')
                .eq('granja', granjaLimpia)
                .eq('fecha', fechaBases)
                .order('id', { ascending: false });

            if (errBusqueda || !registros || registros.length === 0) {
                return res.status(404).json({ error: 'No se encontraron registros de siniestros para esta granja en la fecha.' });
            }

            let restoADescontar = cantidadDescontar;
            for (const reg of registros) {
                if (restoADescontar <= 0) break;
                const siniestrosActuales = reg.siniestros || 0;
                let nuevosSiniestros = siniestrosActuales >= restoADescontar ? siniestrosActuales - restoADescontar : 0;
                restoADescontar -= siniestrosActuales;
                await supabase.from('ingresos_revoltura').update({ siniestros: nuevosSiniestros }).eq('id', reg.id);
            }
        }

        return res.json({ success: true, message: 'Salida procesada correctamente.' });
    } catch (err) {
        console.error("Error en /api/salidas:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Endpoint para descontar de huevos a lavar (Recuperadora / Lavado)
app.post('/api/salidas-recuperado', async (req, res) => {
    const { modo, valor, fechaBases, granja } = req.body;

    try {
        if (!granja || !fechaBases) {
            return res.status(400).json({ error: 'Faltan parámetros obligatorios (granja o fecha).' });
        }

        let granjaLimpia = granja.includes(' - ') ? granja.split(' - ')[1].trim() : granja;
        const cantidadDescontar = parseInt(valor);

        // Buscar los registros de huevos a lavar para esa fecha y granja
        const { data: registros, error: errBusqueda } = await supabase
            .from('huevos_a_lavar')
            .select('*')
            .eq('granja', granjaLimpia)
            .eq('fecha', fechaBases)
            .order('id', { ascending: false });

        if (errBusqueda || !registros || registros.length === 0) {
            return res.status(404).json({ error: 'No se encontraron registros de sucio a lavar para esta fecha.' });
        }

        const disponibleTotal = registros.reduce((sum, r) => sum + (Number(r.cantidad_lavada) || 0), 0);

        if (cantidadDescontar > disponibleTotal) {
            return res.status(400).json({ error: `La cantidad a descontar (${cantidadDescontar}) supera el total disponible (${disponibleTotal}).` });
        }

        let restoADescontar = cantidadDescontar;
        for (const reg of registros) {
            if (restoADescontar <= 0) break;
            const actual = Number(reg.cantidad_lavada) || 0;
            
            if (actual <= restoADescontar) {
                restoADescontar -= actual;
                await supabase.from('huevos_a_lavar').delete().eq('id', reg.id);
            } else {
                const nuevoSaldo = actual - restoADescontar;
                restoADescontar = 0;
                await supabase.from('huevos_a_lavar').update({ cantidad_lavada: nuevoSaldo }).eq('id', reg.id);
            }
        }

        return res.json({ success: true, message: 'Salida de lavado procesada correctamente.' });
    } catch (err) {
        console.error("Error en /api/salidas-recuperado:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 5. Obtener registros de Sucio a Lavar
app.get('/api/huevos-a-lavar', async (req, res) => {
    try {
        const { data, error } = await supabase.from('huevos_a_lavar').select('*').order('fecha', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Obtener registros de Huevo Recuperado
app.get('/api/huevos-recuperados', async (req, res) => {
    try {
        const { data, error } = await supabase.from('huevos_recuperados').select('*').order('fecha', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6.1 Registrar nuevo Huevo Recuperado
app.post('/api/huevos-recuperados', async (req, res) => {
    const { fecha, granja, cantidadRecuperada } = req.body;
    try {
        let granjaLimpia = granja.includes(' - ') ? granja.split(' - ')[1].trim() : granja;
        const { data, error } = await supabase.from('huevos_recuperados').insert([{ fecha, granja: granjaLimpia, cantidad_recuperada: Number(cantidadRecuperada) }]);
        if (error) throw error;
        res.json({ success: true, message: 'Huevo recuperado registrado correctamente', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Registrar nuevo Sucio a Lavar
app.post('/api/huevos-a-lavar', async (req, res) => {
    const { fecha, granja, cantidad_lavada } = req.body;
    try {
        let granjaLimpia = granja.includes(' - ') ? granja.split(' - ')[1].trim() : granja;
        const { data, error } = await supabase.from('huevos_a_lavar').insert([{ fecha, granja: granjaLimpia, cantidad_lavada: Number(cantidad_lavada) }]);
        if (error) throw error;
        res.json({ success: true, message: 'Sucio a lavar registrado correctamente', data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});