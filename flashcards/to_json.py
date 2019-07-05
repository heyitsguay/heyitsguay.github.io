import json


def main():

    translation_pairs = parse_manual_list('wordslearned.md')
    with open('worldslearned.json', 'w') as f:
        json.dump(translation_pairs, f)

    pass


def parse_manual_list(l):
    translation_pairs = []
    with open(l, 'r') as f:
        text = f.read().lower()
    lines = text.split('\n')
    word_lines = [l for l in lines if l[0] == '_']
    for line in world_lines:
        entries = line.split('; from ')
        for entry in entries:
            e_swedish, e_english = entry.split(': ')
            word_swedish = e_swedish.replace('_', '')
            translations_english = e_english.split(', ')
            translation_pairs.append(word_swedish, translations_english)
    return translation_pairs
