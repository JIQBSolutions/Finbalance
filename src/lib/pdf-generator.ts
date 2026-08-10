import * as FileSystem from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { supabase } from "./supabase";

function formatMoney(amount: number, currency: string = "MXN") {
  if (amount === null || amount === undefined) return "$0.00";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
  }).format(amount);
}

function formatSignedMoney(amount: number | null, currency = "MXN") {
  if (amount === null) return "Sin datos";
  if (amount === 0) return formatMoney(0, currency);
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatMoney(amount, currency)}`;
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "Sin fecha";
  const normalizedDate =
    dateString.length <= 10 ? `${dateString}T00:00:00` : dateString;
  const date = new Date(normalizedDate);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getTrendColorHex(amount: number | null) {
  if (amount === null || amount === 0) return "#94A3B8";
  if (amount > 0) return "#0b9387";
  return "#EF4444";
}

export async function generateAndShareFinancialReport(
  workspace: any,
  data: {
    accounts: any[];
    dashboardTrends: any;
    lastCheckIn: any;
    totals: any;
    netWorth: number;
    distributionItems: any[];
    totalAssets: number;
  },
) {
  try {
    const currency = workspace.currency || "MXN";
    const workspaceName = workspace.name || "Mi Workspace";
    const typeLabel =
      workspace.workspace_type === "business" ? "Negocio" : "Personal";

    // Obtener metas
    const { data: goals } = await supabase
      .from("financial_goals")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("is_completed", { ascending: true })
      .order("created_at", { ascending: false });

    // Obtener últimos 10 check-ins
    const { data: checkInsHistory } = await supabase
      .from("check_ins")
      .select("id, check_in_type, check_in_date, notes")
      .eq("workspace_id", workspace.id)
      .order("check_in_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10);

    // Cuentas Operativas (Banco y Efectivo)
    const operationalAccounts = data.accounts.filter(
      (a) => a.account_type === "bank" || a.account_type === "cash",
    );
    const otherAccounts = data.accounts.filter(
      (a) => a.account_type === "investment" || a.account_type === "credit",
    );

    const renderAccountRow = (acc: any) => {
      const balance = Number(acc.balance || 0);
      let typeText = "Cuenta";
      if (acc.account_type === "bank") typeText = "Banco";
      else if (acc.account_type === "cash") typeText = "Efectivo";
      else if (acc.account_type === "investment") typeText = "Inversión";
      else if (acc.account_type === "credit") typeText = "Deuda";

      return `
        <tr>
          <td>${acc.account_name || "Sin nombre"}</td>
          <td>${typeText}</td>
          <td style="text-align: right;">${formatMoney(balance, currency)}</td>
        </tr>
      `;
    };

    const operationalRows =
      operationalAccounts.length > 0
        ? operationalAccounts.map(renderAccountRow).join("")
        : '<tr><td colspan="3" style="text-align: center;">No hay cuentas operativas.</td></tr>';

    const otherRows =
      otherAccounts.length > 0
        ? otherAccounts.map(renderAccountRow).join("")
        : '<tr><td colspan="3" style="text-align: center;">No hay otras cuentas registradas.</td></tr>';

    const distributionRows =
      data.distributionItems
        .filter((item) => item.value > 0)
        .map(
          (item) => `
      <tr>
        <td>
          <span style="display:inline-block; width:12px; height:12px; border-radius:50%; background-color:${item.color}; margin-right:8px;"></span>
          ${item.label}
        </td>
        <td>${item.description}</td>
        <td style="text-align: right;">${formatMoney(item.value, currency)}</td>
      </tr>
    `,
        )
        .join("") ||
      '<tr><td colspan="3" style="text-align: center;">Sin datos de distribución.</td></tr>';

    const goalsRows =
      (goals || [])
        .map((goal: any) => {
          const target = Number(goal.target_amount || 0);
          const current = Number(goal.current_amount || 0);
          const progress =
            target > 0 ? Math.min((current / target) * 100, 100) : 0;
          const typeText =
            goal.goal_type === "savings_goal" ? "Ahorro" : "Deuda";
          const statusText = goal.is_completed ? "Completada" : "En progreso";

          return `
        <tr>
          <td>${goal.name}</td>
          <td>${typeText}</td>
          <td style="text-align: right;">${formatMoney(current, currency)} / ${formatMoney(target, currency)}</td>
          <td style="text-align: right;">${progress.toFixed(1)}%</td>
          <td style="text-align: center;">${statusText}</td>
        </tr>
      `;
        })
        .join("") ||
      '<tr><td colspan="5" style="text-align: center;">No hay metas registradas.</td></tr>';

    const historyRows =
      (checkInsHistory || [])
        .map((ci: any) => {
          let typeLabel = "Operativo";
          if (ci.check_in_type === "initial") typeLabel = "Inicial";
          if (ci.check_in_type === "manual_update")
            typeLabel = "Actualización Manual";

          return `
        <tr>
          <td>${formatDate(ci.check_in_date)}</td>
          <td>${typeLabel}</td>
          <td>${ci.notes || "-"}</td>
        </tr>
      `;
        })
        .join("") ||
      '<tr><td colspan="3" style="text-align: center;">No hay historial reciente.</td></tr>';

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Reporte Financiero Finbalance</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; padding: 40px; background-color: #f8fafc; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #0b9387; padding-bottom: 20px; }
            .header h1 { margin: 0; color: #0f172a; font-size: 28px; }
            .header p { margin: 5px 0 0 0; color: #64748b; font-size: 16px; }
            
            .grid { display: flex; gap: 20px; margin-bottom: 30px; }
            .card { flex: 1; background: #ffffff; padding: 15px; border-radius: 8px; border-left: 4px solid #0b9387; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            .card.red { border-left-color: #EF4444; }
            .card.blue { border-left-color: #38BDF8; }
            
            .card-title { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
            .card-value { font-size: 22px; font-weight: bold; color: #0f172a; }
            .card-desc { font-size: 12px; color: #94A3B8; margin-top: 4px; }
            
            .section-title { font-size: 18px; color: #0f172a; margin-top: 30px; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
            
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            th, td { padding: 10px 15px; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            th { background-color: #f1f5f9; font-weight: 600; color: #475569; text-transform: uppercase; font-size: 12px; }
            tr:last-child td { border-bottom: none; }
            
            .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #94a3b8; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Reporte Financiero</h1>
            <p>${workspaceName} (${typeLabel})</p>
            <p>Generado el ${formatDate(new Date().toISOString())}</p>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-title">Balance Neto Estimado</div>
              <div class="card-value" style="color: ${getTrendColorHex(data.netWorth)}">${formatMoney(data.netWorth, currency)}</div>
              <div class="card-desc">Activos registrados - deudas</div>
            </div>
            <div class="card blue">
              <div class="card-title">Disponible Operativo</div>
              <div class="card-value">${formatMoney(data.totals.operationalAvailable, currency)}</div>
              <div class="card-desc">Dinero líquido actual</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-title">Variación Semanal</div>
              <div class="card-value" style="color: ${getTrendColorHex(data.dashboardTrends.weeklyVariation)}">${formatSignedMoney(data.dashboardTrends.weeklyVariation, currency)}</div>
              <div class="card-desc">vs ${data.dashboardTrends.weeklyReferenceDate ? formatDate(data.dashboardTrends.weeklyReferenceDate) : "N/A"}</div>
            </div>
            <div class="card">
              <div class="card-title">Variación Mensual</div>
              <div class="card-value" style="color: ${getTrendColorHex(data.dashboardTrends.monthlyVariation)}">${formatSignedMoney(data.dashboardTrends.monthlyVariation, currency)}</div>
              <div class="card-desc">vs ${data.dashboardTrends.monthlyReferenceDate ? formatDate(data.dashboardTrends.monthlyReferenceDate) : "N/A"}</div>
            </div>
            <div class="card">
              <div class="card-title">Último Check-In</div>
              <div class="card-value">${data.lastCheckIn ? formatDate(data.lastCheckIn.check_in_date) : "N/A"}</div>
              <div class="card-desc">Fecha de última sincronización</div>
            </div>
          </div>

          <div class="grid">
            <div class="card">
              <div class="card-title">Activos Registrados</div>
              <div class="card-value">${formatMoney(data.totalAssets, currency)}</div>
            </div>
            <div class="card red">
              <div class="card-title">Deuda Registrada</div>
              <div class="card-value">${formatMoney(data.totals.debt, currency)}</div>
            </div>
          </div>

          <div class="section-title">Distribución Financiera</div>
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Descripción</th>
                <th style="text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${distributionRows}
            </tbody>
          </table>

          <div class="section-title">Cuentas Operativas (Banco y Efectivo)</div>
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th style="text-align: right;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${operationalRows}
            </tbody>
          </table>

          <div class="section-title">Otras Cuentas (Inversiones y Deudas)</div>
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th style="text-align: right;">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${otherRows}
            </tbody>
          </table>

          <div class="section-title">Metas y Objetivos</div>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th style="text-align: right;">Avance / Objetivo</th>
                <th style="text-align: right;">Progreso</th>
                <th style="text-align: center;">Estado</th>
              </tr>
            </thead>
            <tbody>
              ${goalsRows}
            </tbody>
          </table>

          <div class="section-title">Historial de Check-ins (Últimos 10)</div>
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              ${historyRows}
            </tbody>
          </table>

          <div class="footer">
            Generado por Finbalance &bull; Claridad financiera mediante saldos reales.
          </div>
        </body>
      </html>
    `;

    if (Platform.OS === "web") {
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      } else {
        alert(
          "Por favor permite las ventanas emergentes para ver el reporte PDF.",
        );
      }
      return;
    }

    const { uri } = await Print.printToFileAsync({ html: htmlContent });

    let finalUri = uri;
    try {
      const timestamp = new Date().getTime();
      const newUri =
        (FileSystem as any).documentDirectory +
        `Reporte_Finbalance_${timestamp}.pdf`;
      await (FileSystem as any).copyAsync({
        from: uri,
        to: newUri,
      });
      finalUri = newUri;
    } catch (fsError) {
      console.warn(
        "No se pudo renombrar el archivo, compartiendo original:",
        fsError,
      );
    }

    await Sharing.shareAsync(finalUri, {
      UTI: ".pdf",
      mimeType: "application/pdf",
      dialogTitle: "Reporte Finbalance",
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
}
