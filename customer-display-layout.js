// Raw positioning works in both React Native and react-native-web. Do not use
// StyleSheet.absoluteFillObject: React Native removed that API in version 0.85.
const ABSOLUTE_FILL_STYLE = Object.freeze({
  position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
});

function productChoiceStage(groups, choices = {}, stage = 0) {
  const index = Math.min(groups.length, Math.max(0, Math.trunc(Number(stage) || 0)));
  const group = groups[index] || null;
  const minimum = group?.required ? (group.min || 1) : 0;
  const selected = group && Array.isArray(choices[group.id]) ? choices[group.id].length : 0;
  const complete = selected >= minimum;
  const drink = group?.id === 'drink' || group?.id?.startsWith('duo-drink');
  const hint = !group || complete ? '' : drink
    ? 'Choisis ta boisson pour continuer.'
    : minimum > 1 ? `Choisis au moins ${minimum} options pour continuer.`
    : 'Choisis une option pour continuer.';
  return { index, group, finalStep: !group, complete, hint };
}

module.exports = { ABSOLUTE_FILL_STYLE, productChoiceStage };
