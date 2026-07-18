(function (global) {
  const COLORS = {
    green: "2F6B4F",
    darkGreen: "234F3B",
    paleGreen: "E4EBE3",
    yellow: "FFF2CC",
    white: "FFFFFF",
    ink: "1A2218",
    muted: "5C6B58",
    border: "AAB8A6",
    alternate: "F7FAF6",
  };

  const thinBorder = {
    top: { style: "thin", color: { argb: COLORS.border } },
    left: { style: "thin", color: { argb: COLORS.border } },
    bottom: { style: "thin", color: { argb: COLORS.border } },
    right: { style: "thin", color: { argb: COLORS.border } },
  };

  function solidFill(color) {
    return { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  }

  function parseLocalDate(isoDate) {
    const parts = String(isoDate || "").split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function tripDistance(trip) {
    const distance = Number(trip.odoEnd) - Number(trip.odoStart);
    return Number.isFinite(distance) && distance >= 0 ? distance : 0;
  }

  function sortTrips(trips) {
    return trips.slice().sort((a, b) => {
      const startCompare = String(a.startDate).localeCompare(String(b.startDate));
      if (startCompare !== 0) return startCompare;
      const startOdometerCompare = Number(a.odoStart) - Number(b.odoStart);
      if (Number.isFinite(startOdometerCompare) && startOdometerCompare !== 0) {
        return startOdometerCompare;
      }
      const endCompare = String(a.endDate).localeCompare(String(b.endDate));
      if (endCompare !== 0) return endCompare;
      const endOdometerCompare = Number(a.odoEnd) - Number(b.odoEnd);
      if (Number.isFinite(endOdometerCompare) && endOdometerCompare !== 0) {
        return endOdometerCompare;
      }
      return Number(a.rowNumber || 0) - Number(b.rowNumber || 0);
    });
  }

  function getBoundaryTrips(trips) {
    const sorted = sortTrips(trips);
    const last = trips.slice().sort((a, b) => {
      const endCompare = String(b.endDate).localeCompare(String(a.endDate));
      if (endCompare !== 0) return endCompare;
      const endOdometerCompare = Number(b.odoEnd) - Number(a.odoEnd);
      if (Number.isFinite(endOdometerCompare) && endOdometerCompare !== 0) {
        return endOdometerCompare;
      }
      return Number(b.rowNumber || 0) - Number(a.rowNumber || 0);
    })[0];
    return { first: sorted[0], last };
  }

  function engineDescription(details) {
    if (details.engineType === "EV") return "EV";
    return details.engineCc + " cc (" + details.engineType + ")";
  }

  function styleSectionHeader(cell) {
    cell.fill = solidFill(COLORS.green);
    cell.font = { name: "Aptos", bold: true, color: { argb: COLORS.white } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = thinBorder;
  }

  function styleLabel(cell) {
    cell.fill = solidFill(COLORS.paleGreen);
    cell.font = { name: "Aptos", bold: true, color: { argb: COLORS.ink } };
    cell.alignment = { vertical: "middle" };
    cell.border = thinBorder;
  }

  function styleValue(cell, options) {
    const config = options || {};
    cell.fill = solidFill(config.yellow ? COLORS.yellow : COLORS.white);
    cell.font = { name: "Aptos", color: { argb: COLORS.ink } };
    cell.alignment = {
      vertical: "middle",
      horizontal: config.center ? "center" : "left",
      wrapText: Boolean(config.wrap),
    };
    cell.border = thinBorder;
  }

  function writeOverview(worksheet, options, trips) {
    const details = options.vehicleDetails;
    const boundaries = getBoundaryTrips(trips);
    const openingOdometer = Number.isFinite(Number(options.openingOdometer))
      ? Number(options.openingOdometer)
      : Number(boundaries.first.odoStart);
    const closingOdometer = Number.isFinite(Number(options.closingOdometer))
      ? Number(options.closingOdometer)
      : Number(boundaries.last.odoEnd);
    const totals = trips.reduce(
      (result, trip) => {
        const distance = tripDistance(trip);
        if (trip.workRelated === "Y") result.work += distance;
        else result.personal += distance;
        return result;
      },
      { work: 0, personal: 0 }
    );
    const total = totals.work + totals.personal;

    worksheet.mergeCells("A1:H1");
    const title = worksheet.getCell("A1");
    title.value = "VEHICLE LOGBOOK";
    title.fill = solidFill(COLORS.darkGreen);
    title.font = {
      name: "Aptos Display",
      size: 18,
      bold: true,
      color: { argb: COLORS.white },
    };
    title.alignment = { horizontal: "center", vertical: "middle" };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells("D3:E3");
    worksheet.getCell("D3").value = "VEHICLE DETAILS";
    styleSectionHeader(worksheet.getCell("D3"));
    styleSectionHeader(worksheet.getCell("E3"));

    worksheet.mergeCells("G3:H3");
    worksheet.getCell("G3").value = "SUMMARY";
    styleSectionHeader(worksheet.getCell("G3"));
    styleSectionHeader(worksheet.getCell("H3"));

    worksheet.mergeCells("A5:B5");
    worksheet.getCell("A5").value = "ODOMETER READINGS";
    styleSectionHeader(worksheet.getCell("A5"));
    styleSectionHeader(worksheet.getCell("B5"));

    const labels = {
      A6: "Financial year:",
      A7: "As at 1st of July:",
      A8: "As at 30th of June:",
      D4: "Make:",
      D5: "Model:",
      D6: "Model year:",
      D7: "Registration:",
      D8: "Engine size/type:",
      G4: "Total travel:",
      G5: "Work-related travel:",
      G6: "Personal travel:",
      G7: "Work-related %:",
      G8: "Personal %:",
    };
    Object.keys(labels).forEach((address) => {
      const cell = worksheet.getCell(address);
      cell.value = labels[address];
      styleLabel(cell);
    });

    const values = {
      B6: options.fyLabel,
      B7: openingOdometer,
      B8: closingOdometer,
      E4: details.make,
      E5: details.model,
      E6: Number(details.modelYear),
      E7: details.registration,
      E8: engineDescription(details),
      H4: total,
      H5: totals.work,
      H6: totals.personal,
      H7: total ? totals.work / total : 0,
      H8: total ? totals.personal / total : 0,
    };
    Object.keys(values).forEach((address) => {
      const cell = worksheet.getCell(address);
      cell.value = values[address];
      styleValue(cell, {
        yellow: address.startsWith("H"),
        center: address.startsWith("B") || address.startsWith("H"),
        wrap: address === "E8",
      });
    });
    worksheet.getCell("H7").numFmt = "0.00%";
    worksheet.getCell("H8").numFmt = "0.00%";
    worksheet.getCell("H4").numFmt = '0 "km"';
    worksheet.getCell("H5").numFmt = '0 "km"';
    worksheet.getCell("H6").numFmt = '0 "km"';
    worksheet.getCell("B7").numFmt = '0 "km"';
    worksheet.getCell("B8").numFmt = '0 "km"';
  }

  function writeTripHeaders(worksheet) {
    worksheet.mergeCells("A10:B10");
    worksheet.mergeCells("C10:D10");
    worksheet.mergeCells("E10:E11");
    worksheet.mergeCells("F10:F11");
    worksheet.mergeCells("G10:G11");
    worksheet.mergeCells("H10:H11");

    const headers = {
      A10: "Date of Trip",
      C10: "Odometer Reading",
      E10: "Purpose of Trip",
      F10: "Work-related? (Y/N)",
      G10: "Work-related (km)",
      H10: "Personal (km)",
      A11: "Start",
      B11: "End",
      C11: "Start",
      D11: "End",
    };
    Object.keys(headers).forEach((address) => {
      const cell = worksheet.getCell(address);
      cell.value = headers[address];
      styleSectionHeader(cell);
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });
    for (let column = 1; column <= 8; column += 1) {
      styleSectionHeader(worksheet.getCell(10, column));
      styleSectionHeader(worksheet.getCell(11, column));
    }
    worksheet.getRow(10).height = 24;
    worksheet.getRow(11).height = 20;
  }

  function writeTrips(worksheet, trips) {
    trips.forEach((trip, index) => {
      const rowNumber = 12 + index;
      const row = worksheet.getRow(rowNumber);
      const distance = tripDistance(trip);
      const isWork = trip.workRelated === "Y";

      row.values = [
        parseLocalDate(trip.startDate),
        parseLocalDate(trip.endDate),
        Number(trip.odoStart),
        Number(trip.odoEnd),
        trip.purpose,
        isWork ? "Y" : "N",
        isWork ? distance : null,
        isWork ? null : distance,
      ];
      row.height = 22;

      for (let column = 1; column <= 8; column += 1) {
        const cell = row.getCell(column);
        styleValue(cell, {
          yellow: column === 7 || column === 8,
          center: column !== 5,
          wrap: column === 5,
        });
        if (index % 2 === 1 && column < 7) {
          cell.fill = solidFill(COLORS.alternate);
        }
      }
      row.getCell(1).numFmt = "dd/mm/yy";
      row.getCell(2).numFmt = "dd/mm/yy";
      row.getCell(3).numFmt = "0";
      row.getCell(4).numFmt = "0";
      row.getCell(7).numFmt = "0";
      row.getCell(8).numFmt = "0";
    });

    const lastRow = 11 + trips.length;
    worksheet.dataValidations.add("F12:F" + lastRow, {
      type: "list",
      allowBlank: false,
      formulae: ['"Y,N"'],
      showErrorMessage: true,
      errorStyle: "stop",
      errorTitle: "Invalid trip type",
      error: "Enter Y for work-related travel or N for personal travel.",
    });
  }

  function configureWorksheet(worksheet, tripCount) {
    worksheet.columns = [
      { key: "startDate", width: 13 },
      { key: "endDate", width: 13 },
      { key: "startOdo", width: 14 },
      { key: "endOdo", width: 14 },
      { key: "purpose", width: 34 },
      { key: "work", width: 16 },
      { key: "workKm", width: 16 },
      { key: "personalKm", width: 16 },
    ];
    worksheet.views = [
      {
        state: "frozen",
        ySplit: 11,
        topLeftCell: "A12",
        showGridLines: false,
      },
    ];
    worksheet.pageSetup = {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printArea: "A1:H" + (11 + tripCount),
      margins: {
        left: 0.3,
        right: 0.3,
        top: 0.5,
        bottom: 0.5,
        header: 0.2,
        footer: 0.2,
      },
    };
    worksheet.headerFooter.oddFooter =
      '&LLogBook&CPage &P of &N&RGenerated by LogBook';
  }

  function triggerDownload(buffer, filename) {
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadLogBook(options) {
    if (!global.ExcelJS) {
      throw new Error("The Excel download library did not load. Refresh and try again.");
    }
    if (!options.trips.length) {
      throw new Error("Add at least one trip before downloading.");
    }

    const trips = sortTrips(options.trips);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "LogBook";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Vehicle logbook for " + options.fyLabel;
    workbook.title = "Vehicle LogBook " + options.fyLabel;
    workbook.company = options.vehicleDetails.make;
    workbook.calcProperties.fullCalcOnLoad = true;

    const worksheet = workbook.addWorksheet("Record Keeping", {
      properties: { defaultRowHeight: 20 },
      pageSetup: { orientation: "landscape" },
    });
    configureWorksheet(worksheet, trips.length);
    writeOverview(worksheet, options, trips);
    writeTripHeaders(worksheet);
    writeTrips(worksheet, trips);

    const buffer = await workbook.xlsx.writeBuffer();
    const safeFy = String(options.fyLabel).replace(/[^0-9-]/g, "");
    triggerDownload(buffer, "LogBook-" + safeFy + ".xlsx");
  }

  global.LogBookExport = { downloadLogBook };
})(window);
