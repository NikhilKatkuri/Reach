import { typography } from '@/constants/typography';
import { Text, View } from 'react-native';

const index = () => {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={typography.h1}>Main Heading</Text>
      <Text style={typography.medium}>Medium weight text with custom spacing</Text>
      <Text style={typography.code}>const x = 10;</Text>
    </View>
  );
};

export default index;
