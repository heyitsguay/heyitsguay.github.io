import json


def main():

    translation_pairs = parse_markdown_list('wordslearned.md')
    with open('wordslearned.json', 'w') as f:
        json.dump(translation_pairs, f)

    pass


def parse_markdown_list(l):
    translation_pairs = []
    with open(l, 'r') as f:
        text = f.read().lower()
    lines = text.split('\n')
    word_lines = [l for l in lines if len(l) > 0 and l[0] == '_']
    for line in word_lines:
        entries = line.split('; from ')
        for entry in entries:
            e_swedish, e_english = entry.split(': ')
            word_swedish = e_swedish.replace('_', '')
            translations_english = e_english.split(', ')
            for i, translation in enumerate(translations_english):
                if '(' in translation and ')' in translation:
                    lparen_pos = translation.find('(')
                    rparen_pos = translation.find(')')
                    paren_contents = translation[lparen_pos+1:rparen_pos]
                    translation1 = translation[:lparen_pos]
                    translation2 = translation1 + paren_contents
                    translations_english[i] = translation1
                    translations_english.append(translation2)
            translation_pairs.append((word_swedish, translations_english))
    return translation_pairs


if __name__ == '__main__':
    main()
