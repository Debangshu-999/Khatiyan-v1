"""
Copies Google Sans into assets/fonts/google-sans with Android-friendly vertical bounds.

Google Sans covers many scripts, so its files declare a bounding box from -0.99 to 1.46
of the font size (and Windows bounds even taller). Android pads every line of text out
to that box, which left large gaps on the phone that the browser never showed: the
browser lays text out from the typographic metrics instead (user, 2026-11-07).

The copies keep every glyph and metric except the box and the Windows bounds, which are
set to Inter's proportions, the face the app used before. The SIL Open Font License
allows modified copies, and its text travels with them.

Run from frontend/:  python scripts/tools/patch-google-sans-metrics.py
"""
import os
import shutil
import struct

SOURCE = "node_modules/@expo-google-fonts/google-sans"
TARGET = "assets/fonts/google-sans"
WEIGHTS = ["400Regular", "500Medium", "500Medium_Italic", "600SemiBold", "700Bold"]
# Inter's box, as a share of the em: what text was laid out with before the switch.
TOP, BOTTOM = 1.108, -0.322


def table_directory(data):
    count = struct.unpack(">H", data[4:6])[0]
    tables = {}
    for index in range(count):
        record = 12 + 16 * index
        tag, _checksum, offset, length = struct.unpack(">4sIII", data[record:record + 16])
        tables[tag.decode()] = (record, offset, length)
    return tables


def checksum(data):
    padded = data + b"\0" * ((4 - len(data) % 4) % 4)
    return sum(struct.unpack(">%dI" % (len(padded) // 4), padded)) & 0xFFFFFFFF


def patch(data):
    data = bytearray(data)
    tables = table_directory(data)
    _, head, _ = tables["head"]
    units = struct.unpack(">H", data[head + 18:head + 20])[0]
    top, bottom = round(TOP * units), round(BOTTOM * units)
    struct.pack_into(">h", data, head + 38, bottom)  # yMin
    struct.pack_into(">h", data, head + 42, top)  # yMax
    _, os2, _ = tables["OS/2"]
    struct.pack_into(">HH", data, os2 + 74, top, -bottom)  # usWinAscent, usWinDescent
    # Fresh table checksums, then the whole-file adjustment the head table carries.
    struct.pack_into(">I", data, head + 8, 0)
    for record, offset, length in tables.values():
        struct.pack_into(">I", data, record + 4, checksum(bytes(data[offset:offset + length])))
    struct.pack_into(">I", data, head + 8, (0xB1B0AFBA - checksum(bytes(data))) & 0xFFFFFFFF)
    return bytes(data)


os.makedirs(TARGET, exist_ok=True)
for weight in WEIGHTS:
    name = "GoogleSans_%s.ttf" % weight
    with open(os.path.join(SOURCE, weight, name), "rb") as source:
        patched = patch(source.read())
    with open(os.path.join(TARGET, name), "wb") as target:
        target.write(patched)
    print("wrote", name)
shutil.copyfile(os.path.join(SOURCE, "LICENSE_FONT"), os.path.join(TARGET, "OFL.txt"))
