import type { SandstoneConfig } from 'sandstone'

export default {
  name: 'floatVar',
  packs: {
    datapack: {
      description: ['A ', { text: 'Sandstone', color: 'gold' }, ' datapack.'],
      packFormat: 121,
    },
    resourcepack: {
      description: ['A ', { text: 'Sandstone', color: 'gold' }, ' resource pack.'],
      packFormat: 97,
    }
  },
  onConflict: {
    default: 'warn',
  },
  namespace: 'floatvar',
  packUid: 'vX2v5xsQ',
  mcmeta: 'latest',
  saveOptions: {
    clientPath: 'C:\\Users\\TOSHIBA\\AppData\\Roaming\\ModrinthApp\\profiles\\Data_Resource Pack Modpack',
    world: 'FRIANDISE'
  },
} as SandstoneConfig
