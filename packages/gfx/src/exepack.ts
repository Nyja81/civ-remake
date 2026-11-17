/**
 * Rozpakowanie CIV.EXE (Microsoft EXEPACK). Używane przez packages/oracle (generowanie tabel silnika) i przez interfejs,
 * który w czasie działania czyta z CIV.EXE gracza dane grafiki (np. położenia klatek twarzy władców) — plik EXE
 * i dane z niego nie trafiają do repozytorium.
 */

/**
 * CIV.EXE jest spakowany narzędziem Microsoft EXEPACK (ciągi powtórzeń zapisane skrótowo),
 * więc tabel nie da się czytać wprost z pliku. Funkcja zwraca rozpakowany obraz programu
 * (bez nagłówka MZ i bez relokacji — do odczytu danych nie są potrzebne).
 */
export function unpackExepack(file: Uint8Array): Uint8Array {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  if (view.getUint16(0, true) !== 0x5a4d) throw new Error('To nie jest plik MZ EXE');
  const headerSize = view.getUint16(8, true) * 16;
  const packedSize = view.getUint16(0x16, true) * 16; // początkowy CS = początek nagłówka EXEPACK
  const packHeader = headerSize + packedSize;

  // Nagłówek EXEPACK ma 16 lub 18 bajtów (nowszy zawiera pole skip_len) i kończy się sygnaturą "RB".
  let skipLen = 1;
  if (view.getUint16(packHeader + 14, true) === 0x4252) {
    skipLen = 1;
  } else if (view.getUint16(packHeader + 16, true) === 0x4252) {
    skipLen = view.getUint16(packHeader + 14, true);
  } else {
    throw new Error('Nie znaleziono sygnatury EXEPACK — nieobsługiwana wersja CIV.EXE');
  }
  const destSize = view.getUint16(packHeader + 12, true) * 16;
  const padding = (skipLen - 1) * 16;

  const out = new Uint8Array(Math.max(destSize, packedSize));
  out.set(file.subarray(headerSize, headerSize + packedSize));

  // Rozpakowanie przebiega od końca do początku, w miejscu.
  let src = packedSize - padding;
  let dst = destSize - padding;
  while (out[src - 1] === 0xff) src--;
  for (;;) {
    const command = out[--src]!;
    src -= 2;
    const count = out[src]! | (out[src + 1]! << 8);
    if ((command & 0xfe) === 0xb0) {
      const value = out[--src]!;
      out.fill(value, dst - count, dst);
      dst -= count;
    } else if ((command & 0xfe) === 0xb2) {
      for (let i = 0; i < count; i++) out[--dst] = out[--src]!;
    } else {
      throw new Error(`Błąd rozpakowywania EXEPACK: nieznane polecenie 0x${command.toString(16)}`);
    }
    if (command & 1) break;
  }
  return out.subarray(0, destSize);
}
