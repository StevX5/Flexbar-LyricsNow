<template>
  <v-container class="nowplaying-settings">
    <v-card flat>
      <v-card-title class="text-subtitle-1">
        <v-icon class="mr-2" size="small">mdi-cog</v-icon>
        {{ $t('NowPlaying.Title') }}
      </v-card-title>
      
      <v-card-text>
        <v-list density="compact">
          <v-list-item>
            <template v-slot:prepend>
              <v-checkbox
                v-model="modelValue.data.showTitle"
                hide-details
                density="compact"
                @update:modelValue="emitUpdate"
              />
            </template>
            <v-list-item-title>{{ $t('NowPlaying.UI.ShowTitle') }}</v-list-item-title>
          </v-list-item>
          
          <v-list-item>
            <template v-slot:prepend>
              <v-checkbox
                v-model="modelValue.data.showArtist"
                hide-details
                density="compact"
                @update:modelValue="emitUpdate"
              />
            </template>
            <v-list-item-title>{{ $t('NowPlaying.UI.ShowArtist') }}</v-list-item-title>
          </v-list-item>
          
          <v-list-item>
            <template v-slot:prepend>
              <v-checkbox
                v-model="modelValue.data.showAlbum"
                hide-details
                density="compact"
                @update:modelValue="emitUpdate"
              />
            </template>
            <v-list-item-title>{{ $t('NowPlaying.UI.ShowAlbum') }}</v-list-item-title>
          </v-list-item>
          
          <v-list-item>
            <template v-slot:prepend>
              <v-checkbox
                v-model="modelValue.data.showProgress"
                hide-details
                density="compact"
                @update:modelValue="emitUpdate"
              />
            </template>
            <v-list-item-title>{{ $t('NowPlaying.UI.ShowProgress') }}</v-list-item-title>
          </v-list-item>

          <v-list-item>
            <template v-slot:prepend>
              <v-checkbox
                v-model="modelValue.data.useDynamicBackground"
                hide-details
                density="compact"
                @update:modelValue="emitUpdate"
              />
            </template>
            <v-list-item-title>{{ $t('NowPlaying.UI.UseDynamicBackground') }}</v-list-item-title>
          </v-list-item>
        </v-list>

        <v-divider class="my-3" />

        <div class="text-subtitle-2 mb-2">{{ $t('NowPlaying.UI.BackgroundColor') }}</div>
        <v-row dense>
          <v-col cols="6">
            <v-menu :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-text-field
                  v-model="modelValue.data.backgroundColor"
                  :label="$t('NowPlaying.UI.BackgroundColor')"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                >
                  <template v-slot:prepend-inner>
                    <div class="color-preview" :style="{ backgroundColor: modelValue.data.backgroundColor }" />
                  </template>
                </v-text-field>
              </template>
              <v-color-picker
                v-model="modelValue.data.backgroundColor"
                mode="hex"
                @update:modelValue="emitUpdate"
              />
            </v-menu>
          </v-col>

          <v-col cols="6">
            <v-menu :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-text-field
                  v-model="modelValue.data.secondaryTextColor"
                  :label="$t('NowPlaying.UI.SecondaryTextColor')"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                >
                  <template v-slot:prepend-inner>
                    <div class="color-preview" :style="{ backgroundColor: modelValue.data.secondaryTextColor }" />
                  </template>
                </v-text-field>
              </template>
              <v-color-picker
                v-model="modelValue.data.secondaryTextColor"
                mode="hex"
                @update:modelValue="emitUpdate"
              />
            </v-menu>
          </v-col>
        </v-row>

        <v-divider class="my-3" />

        <div class="text-subtitle-2 mb-2">{{ $t('NowPlaying.UI.Progress.Title') }}</div>
        <v-row dense>
          <v-col cols="6">
            <v-menu :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-text-field
                  v-model="modelValue.data.progressFillColor"
                  :label="$t('NowPlaying.UI.Progress.FillColor')"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                >
                  <template v-slot:prepend-inner>
                    <div class="color-preview" :style="{ backgroundColor: modelValue.data.progressFillColor }" />
                  </template>
                </v-text-field>
              </template>
              <v-color-picker
                v-model="modelValue.data.progressFillColor"
                mode="hex"
                @update:modelValue="emitUpdate"
              />
            </v-menu>
          </v-col>

          <v-col cols="6">
            <v-menu :close-on-content-click="false">
              <template v-slot:activator="{ props }">
                <v-text-field
                  v-model="modelValue.data.progressBgColor"
                  :label="$t('NowPlaying.UI.Progress.BgColor')"
                  variant="outlined"
                  density="compact"
                  hide-details
                  readonly
                  v-bind="props"
                >
                  <template v-slot:prepend-inner>
                    <div class="color-preview" :style="{ backgroundColor: modelValue.data.progressBgColor }" />
                  </template>
                </v-text-field>
              </template>
              <v-color-picker
                v-model="modelValue.data.progressBgColor"
                mode="hex"
                @update:modelValue="emitUpdate"
              />
            </v-menu>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script>
export default {
  name: 'NowPlayingSettings',
  props: {
    modelValue: {
      type: Object,
      required: true
    }
  },
  emits: ['update:modelValue'],
  methods: {
    emitUpdate() {
      this.$emit('update:modelValue', this.modelValue);
    },
    initDefaults() {
      // Ensure data object exists with defaults
      if (!this.modelValue.data) {
        this.modelValue.data = {};
      }
      if (this.modelValue.data.showTitle === undefined) {
        this.modelValue.data.showTitle = true;
      }
      if (this.modelValue.data.showArtist === undefined) {
        this.modelValue.data.showArtist = true;
      }
      if (this.modelValue.data.showAlbum === undefined) {
        this.modelValue.data.showAlbum = true;
      }
      if (this.modelValue.data.showProgress === undefined) {
        this.modelValue.data.showProgress = true;
      }
      if (this.modelValue.data.useDynamicBackground === undefined) {
        this.modelValue.data.useDynamicBackground = false;
      }
      if (this.modelValue.data.backgroundColor === undefined) {
        this.modelValue.data.backgroundColor = '#121212';
      }
      if (this.modelValue.data.secondaryTextColor === undefined) {
        this.modelValue.data.secondaryTextColor = '#D6D6D6';
      }
      if (this.modelValue.data.progressFillColor === undefined) {
        this.modelValue.data.progressFillColor = '#1DB954';
      }
      if (this.modelValue.data.progressBgColor === undefined) {
        this.modelValue.data.progressBgColor = '#404040';
      }
    }
  },
  mounted() {
    this.$fd.info('Now Playing settings loaded');
    this.initDefaults();
  }
};
</script>

<style scoped>
.nowplaying-settings {
  padding: 8px;
}

.color-preview {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #666;
  cursor: pointer;
}
</style>
