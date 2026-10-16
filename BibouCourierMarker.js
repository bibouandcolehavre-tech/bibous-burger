import React from 'react';
import {Image,StyleSheet,View} from 'react-native';

// Separate unchanged logo image layers: never use the AI-redrawn white logos.
export default function BibouCourierMarker({size=80}) {
  return <View style={{width:size,height:size/1.2}} accessible accessibilityRole="image" accessibilityLabel="Le petit Bibou à vélo représente la position de votre livreur" testID="bibou-courier-marker">
    <Image accessible={false} source={require('./assets/bibou-courier-character-v1.png')} style={styles.base} resizeMode="contain" />
    <Image accessible={false} testID="bibou-courier-logo-bag" source={require('./assets/bibous-official-wordmark-preview.png')} style={styles.bag} resizeMode="contain" />
    <Image accessible={false} testID="bibou-courier-logo-helmet" source={require('./assets/bibous-official-wordmark-preview.png')} style={styles.helmet} resizeMode="contain" />
  </View>;
}
const styles=StyleSheet.create({
  base:{width:'100%',height:'100%'},
  bag:{position:'absolute',left:'17.5%',top:'47.5%',width:'14%',aspectRatio:2,transform:[{rotate:'1deg'}]},
  helmet:{position:'absolute',left:'38.8%',top:'5.5%',width:'14%',aspectRatio:2,transform:[{rotate:'-23deg'}]},
});
